// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
    countRows,
    createUser,
    rowInsert,
    seedUserGraph,
    type UserGraph,
} from '@db/tests/helpers/fixtures'
import { createTestDb, type TestDb } from '@db/tests/helpers/pglite'

type CountRow = { count: number }
type NameRow = { name: string }
type StaleRow = { stale: boolean }

// RLS on, no policies, no privileges for authenticated: only the service role touches them.
const SERVICE_ONLY_TABLES = new Set(['schema_migrations'])

const INSUFFICIENT_PRIVILEGE = '42501'
const FOREIGN_KEY_VIOLATION = '23503'

let testDb: TestDb
// Every table found in the schema, so a table added later is covered without editing this file.
let allTables: string[]
// Tables with a user_id column (every table except the migration log).
let userTables: string[]
// Tables a signed-in user with access may use through RLS.
let clientTables: string[]
let userA: UserGraph
let userB: UserGraph
let userC: UserGraph

async function countVisible(table: string): Promise<number> {
    const result = await testDb.db.query<CountRow>(
        `select count(*)::int as count from roxcoach.${table}`
    )
    return result.rows[0].count
}

async function countOwnedEverywhere(userId: string): Promise<number[]> {
    await testDb.asService()
    return Promise.all(userTables.map((table) => countRows(testDb, table, userId)))
}

// True when none of the user's rows in the table was ever updated (the trigger moves updated_at).
async function untouched(table: string, userId: string): Promise<boolean> {
    await testDb.asService()
    const result = await testDb.db.query<StaleRow>(
        `select bool_and(updated_at = created_at) as stale from roxcoach.${table} where user_id = $1`,
        [userId]
    )
    return result.rows[0].stale
}

async function runInsert(table: string, graph: UserGraph): Promise<void> {
    const statement = rowInsert(table, graph)
    await testDb.db.query(statement.sql, statement.params)
}

beforeAll(async () => {
    testDb = await createTestDb()
    await testDb.asSuperuser()
    const tables = await testDb.db.query<NameRow>(
        `select table_name as name from information_schema.tables
         where table_schema = 'roxcoach' and table_type = 'BASE TABLE' order by table_name`
    )
    allTables = tables.rows.map((row) => row.name)
    userTables = allTables.filter((table) => table !== 'schema_migrations')
    clientTables = allTables.filter((table) => !SERVICE_ONLY_TABLES.has(table))

    const ids = [await createUser(testDb), await createUser(testDb), await createUser(testDb)]
    userA = await seedUserGraph(testDb, ids[0])
    userB = await seedUserGraph(testDb, ids[1])
    userC = await seedUserGraph(testDb, ids[2])
})

afterAll(async () => {
    await testDb.close()
})

beforeEach(async () => {
    await testDb.asService()
})

describe('fixtures', () => {
    it('finds the expected tables and seeds every user table for each user', async () => {
        expect(clientTables.length).toBeGreaterThan(0)
        expect(await countOwnedEverywhere(userA.userId)).toEqual(userTables.map(() => 1))
        expect(await countOwnedEverywhere(userB.userId)).toEqual(userTables.map(() => 1))
        expect(await countOwnedEverywhere(userC.userId)).toEqual(userTables.map(() => 1))
    })
})

describe('a user with access (A)', () => {
    it('selects exactly its own rows from every client table', async () => {
        await testDb.asUser(userA.userId)
        const visible = await Promise.all(clientTables.map((table) => countVisible(table)))
        const owned = await Promise.all(
            clientTables.map((table) => countRows(testDb, table, userA.userId))
        )

        expect(visible).toEqual(clientTables.map(() => 1))
        expect(owned).toEqual(clientTables.map(() => 1))
    })

    it('updates zero of B rows in every client table', async () => {
        await testDb.asUser(userA.userId)
        const results = await Promise.all(
            clientTables.map((table) =>
                testDb.db.query(
                    `update roxcoach.${table} set user_id = user_id where user_id = $1`,
                    [userB.userId]
                )
            )
        )

        expect(results.map((result) => result.affectedRows)).toEqual(clientTables.map(() => 0))
        const unchanged = await Promise.all(
            clientTables.map((table) => untouched(table, userB.userId))
        )
        expect(unchanged).toEqual(clientTables.map(() => true))
    })

    it('deletes zero of B rows in every client table', async () => {
        await testDb.asUser(userA.userId)
        const results = await Promise.all(
            clientTables.map((table) =>
                testDb.db.query(`delete from roxcoach.${table} where user_id = $1`, [userB.userId])
            )
        )

        expect(results.map((result) => result.affectedRows)).toEqual(clientTables.map(() => 0))
        expect(await countOwnedEverywhere(userB.userId)).toEqual(userTables.map(() => 1))
    })

    it('cannot insert a row owned by B in any user table', async () => {
        await testDb.asUser(userA.userId)

        for (const table of userTables) {
            // oxlint-disable-next-line no-await-in-loop -- one statement at a time to name the table
            await expect(runInsert(table, userB), table).rejects.toMatchObject({
                code: INSUFFICIENT_PRIVILEGE,
            })
        }
        expect(await countOwnedEverywhere(userB.userId)).toEqual(userTables.map(() => 1))
    })

    it('cannot hand its own rows to B by update (with check)', async () => {
        await testDb.asUser(userA.userId)

        for (const table of clientTables) {
            // oxlint-disable-next-line no-await-in-loop -- one statement at a time to name the table
            await expect(
                testDb.db.query(`update roxcoach.${table} set user_id = $1 where user_id = $2`, [
                    userB.userId,
                    userA.userId,
                ]),
                table
            ).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE })
        }
        expect(await countOwnedEverywhere(userA.userId)).toEqual(userTables.map(() => 1))
    })

    it('can insert its own child rows, so the policy alone would pass', async () => {
        await testDb.asUser(userA.userId)
        await testDb.db.query(
            'insert into roxcoach.activity_laps (user_id, activity_id, lap_index) values ($1, $2, 1)',
            [userA.userId, userA.activityId]
        )
        await testDb.db.query('delete from roxcoach.activity_laps where lap_index = 1')
    })

    it.each([
        ['activity_laps', 'activity_laps_activity_id_user_id_fkey', 'activityId'],
        ['activity_files', 'activity_files_activity_id_user_id_fkey', 'activityId'],
        ['station_results', 'station_results_activity_id_user_id_fkey', 'activityId'],
        ['strength_sets', 'strength_sets_activity_id_user_id_fkey', 'activityId'],
        ['planned_sessions', 'planned_sessions_report_id_user_id_fkey', 'reportId'],
        ['planned_sessions', 'planned_sessions_race_id_user_id_fkey', 'raceId'],
        ['planned_sessions', 'planned_sessions_matched_activity_id_user_id_fkey', 'activityId'],
    ] as const)('cannot attach a %s row to a B parent (%s)', async (table, constraint, parent) => {
        // A's own user_id passes the policy: only the one parent id points at B.
        const graph: UserGraph = { ...userA, [parent]: userB[parent] }
        await testDb.asUser(userA.userId)

        await expect(runInsert(table, graph)).rejects.toMatchObject({
            code: FOREIGN_KEY_VIOLATION,
            constraint,
        })
    })
})

describe('a signed-in user without access (C)', () => {
    it('selects zero rows from every client table, its own included', async () => {
        await testDb.asUser(userC.userId, { access: false })
        const visible = await Promise.all(clientTables.map((table) => countVisible(table)))

        expect(visible).toEqual(clientTables.map(() => 0))
    })

    it('cannot insert its own rows in any user table', async () => {
        await testDb.asUser(userC.userId, { access: false })

        for (const table of userTables) {
            // oxlint-disable-next-line no-await-in-loop -- one statement at a time to name the table
            await expect(runInsert(table, userC), table).rejects.toMatchObject({
                code: INSUFFICIENT_PRIVILEGE,
            })
        }
        expect(await countOwnedEverywhere(userC.userId)).toEqual(userTables.map(() => 1))
    })

    it('updates and deletes zero of its own rows', async () => {
        await testDb.asUser(userC.userId, { access: false })
        const updates = await Promise.all(
            clientTables.map((table) =>
                testDb.db.query(`update roxcoach.${table} set user_id = user_id`)
            )
        )
        const deletes = await Promise.all(
            clientTables.map((table) => testDb.db.query(`delete from roxcoach.${table}`))
        )

        expect(updates.map((result) => result.affectedRows)).toEqual(clientTables.map(() => 0))
        expect(deletes.map((result) => result.affectedRows)).toEqual(clientTables.map(() => 0))
        expect(await countOwnedEverywhere(userC.userId)).toEqual(userTables.map(() => 1))
    })
})

describe('anon', () => {
    it('is denied every table', async () => {
        await testDb.asAnon()

        for (const table of allTables) {
            // oxlint-disable-next-line no-await-in-loop -- one statement at a time to name the table
            await expect(countVisible(table), table).rejects.toMatchObject({
                code: INSUFFICIENT_PRIVILEGE,
            })
        }
    })
})

describe('service-only tables', () => {
    it('deny authenticated any read, even for its own rows', async () => {
        await testDb.asUser(userA.userId)

        for (const table of SERVICE_ONLY_TABLES) {
            // oxlint-disable-next-line no-await-in-loop -- one statement at a time to name the table
            await expect(countVisible(table), table).rejects.toMatchObject({
                code: INSUFFICIENT_PRIVILEGE,
            })
        }
    })

    it('deny authenticated writes to the migration log', async () => {
        await testDb.asUser(userA.userId)

        await expect(
            testDb.db.query(
                `insert into roxcoach.schema_migrations (filename) values ('9999_x.sql')`
            )
        ).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE })
        await expect(
            testDb.db.query('delete from roxcoach.schema_migrations')
        ).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE })
    })
})

describe('the service role', () => {
    it('reads every user row in every table', async () => {
        const users = [userA.userId, userB.userId, userC.userId]
        const results = await Promise.all(
            userTables.map((table) =>
                testDb.db.query<CountRow>(
                    `select count(*)::int as count from roxcoach.${table} where user_id = any($1)`,
                    [users]
                )
            )
        )

        expect(results.map((result) => result.rows[0].count)).toEqual(userTables.map(() => 3))
        expect(await countVisible('schema_migrations')).toBeGreaterThan(0)
    })
})

describe('deleting a user', () => {
    it('removes every row of that user and none of another', async () => {
        const doomed = await seedUserGraph(testDb, await createUser(testDb))
        const survivor = await seedUserGraph(testDb, await createUser(testDb))

        await testDb.asSuperuser()
        await testDb.db.query('delete from auth.users where id = $1', [doomed.userId])

        expect(await countOwnedEverywhere(doomed.userId)).toEqual(userTables.map(() => 0))
        expect(await countOwnedEverywhere(survivor.userId)).toEqual(userTables.map(() => 1))
    })
})
