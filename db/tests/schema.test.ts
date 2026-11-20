// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
    countRows,
    createUser,
    insertActivity,
    insertRace,
    insertReport,
    seedUserGraph,
} from '@db/tests/helpers/fixtures'
import { createTestDb, type TestDb } from '@db/tests/helpers/pglite'

type TableRow = { table_schema: string; table_name: string }
type GrantRow = { table_name: string; anon: boolean; authenticated: boolean; service: boolean }

const ROXCOACH_TABLES = [
    'activities',
    'activity_files',
    'activity_laps',
    'athlete_profiles',
    'availability_slots',
    'planned_sessions',
    'races',
    'schema_migrations',
    'station_results',
    'strength_sets',
    'weekly_reports',
]

const USER_TABLES = ROXCOACH_TABLES.filter((table) => table !== 'schema_migrations')

// Tables only the service role may touch: 0006 revokes every privilege on them from authenticated.
const SERVICE_ONLY_TABLES = new Set(['schema_migrations'])

const UNIQUE_ERROR = /unique/u
const CHECK_ERROR = /check constraint/u

let testDb: TestDb

async function countEveryTable(userId: string): Promise<Record<string, number>> {
    const counts = await Promise.all(USER_TABLES.map((table) => countRows(testDb, table, userId)))
    return Object.fromEntries(USER_TABLES.map((table, index) => [table, counts[index]]))
}

beforeAll(async () => {
    testDb = await createTestDb()
})

afterAll(async () => {
    await testDb.close()
})

beforeEach(async () => {
    await testDb.asService()
})

describe('schema layout', () => {
    it('creates every table in the roxcoach schema and nothing in public', async () => {
        await testDb.asSuperuser()
        const result = await testDb.db.query<TableRow>(
            `select table_schema, table_name from information_schema.tables
             where table_schema in ('roxcoach', 'public') order by table_name`
        )
        const roxcoach = result.rows.filter((row) => row.table_schema === 'roxcoach')
        const publicTables = result.rows.filter((row) => row.table_schema === 'public')

        expect(roxcoach.map((row) => row.table_name)).toEqual(ROXCOACH_TABLES)
        expect(publicTables).toEqual([])
    })

    it('records every applied migration file', async () => {
        const result = await testDb.db.query<{ filename: string }>(
            'select filename from roxcoach.schema_migrations order by filename'
        )

        expect(result.rows.map((row) => row.filename)).toEqual([
            '0001_schema_and_enums.sql',
            '0002_athlete_and_races.sql',
            '0003_strava.sql',
            '0004_training.sql',
            '0005_coach_and_plan.sql',
            '0006_rls.sql',
            '0007_remove_strava.sql',
            '0008_activity_files.sql',
        ])
    })

    it('grants client tables to authenticated, every table to service_role, nothing to anon', async () => {
        await testDb.asSuperuser()
        const result = await testDb.db.query<GrantRow>(
            `select
                table_name,
                has_table_privilege('anon', 'roxcoach.' || table_name, 'select') as anon,
                has_table_privilege('authenticated', 'roxcoach.' || table_name, 'select') as authenticated,
                has_table_privilege('service_role', 'roxcoach.' || table_name, 'select, insert, update, delete') as service
             from information_schema.tables where table_schema = 'roxcoach' order by table_name`
        )

        expect(result.rows).toEqual(
            ROXCOACH_TABLES.map((table) => ({
                table_name: table,
                anon: false,
                authenticated: !SERVICE_ONLY_TABLES.has(table),
                service: true,
            }))
        )
    })

    it('lets authenticated write user tables but not the migration log', async () => {
        await testDb.asSuperuser()
        const result = await testDb.db.query<{ activities: boolean; migrations: boolean }>(
            `select
                has_table_privilege('authenticated', 'roxcoach.activities', 'insert, update, delete') as activities,
                has_table_privilege('authenticated', 'roxcoach.schema_migrations', 'insert, update, delete') as migrations`
        )

        expect(result.rows[0]).toEqual({ activities: true, migrations: false })
    })

    it('defaults user_id to auth.uid() for a signed-in user', async () => {
        const userId = await createUser(testDb)
        await testDb.asUser(userId)
        const result = await testDb.db.query<{ user_id: string }>(
            `insert into roxcoach.availability_slots (weekday, session_kind, is_fixed)
             values (3, 'run', false) returning user_id`
        )

        expect(result.rows[0].user_id).toBe(userId)
    })

    it('maintains updated_at on update', async () => {
        const userId = await createUser(testDb)
        const raceId = await insertRace(testDb, userId)
        await testDb.db.query(`update roxcoach.races set updated_at = '2000-01-01' where id = $1`, [
            raceId,
        ])
        await testDb.db.query(`update roxcoach.races set notes = 'windy' where id = $1`, [raceId])
        const result = await testDb.db.query<{ recent: boolean }>(
            `select updated_at > '2001-01-01' as recent from roxcoach.races where id = $1`,
            [raceId]
        )

        expect(result.rows[0].recent).toBe(true)
    })
})

describe('unique constraints', () => {
    it('rejects a duplicate availability slot and accepts it for another user', async () => {
        const userId = await createUser(testDb)
        const other = await createUser(testDb)
        const sql = `insert into roxcoach.availability_slots (user_id, weekday, session_kind, is_fixed)
                     values ($1, 1, 'strength', false)`
        await testDb.db.query(sql, [userId])

        await expect(testDb.db.query(sql, [userId])).rejects.toThrow(UNIQUE_ERROR)
        await expect(testDb.db.query(sql, [other])).resolves.toBeDefined()
    })

    it('rejects a duplicate weekly report and accepts it for another user', async () => {
        const userId = await createUser(testDb)
        const other = await createUser(testDb)
        await insertReport(testDb, userId, '2026-11-09')

        await expect(insertReport(testDb, userId, '2026-11-09')).rejects.toThrow(UNIQUE_ERROR)
        await expect(insertReport(testDb, other, '2026-11-09')).resolves.toBeDefined()
    })

    it('accepts many manual activities for one user', async () => {
        const userId = await createUser(testDb)
        await insertActivity(testDb, userId)

        await expect(insertActivity(testDb, userId)).resolves.toBeDefined()
    })
})

describe('activity_files', () => {
    async function insertFile(
        userId: string,
        overrides: { sha256?: string; format?: string; status?: string; activityId?: string | null }
    ): Promise<void> {
        await testDb.db.query(
            `insert into roxcoach.activity_files
                (user_id, activity_id, format, storage_path, sha256, size_bytes, original_name, status)
             values ($1, $2, $3, $1::uuid::text || '/' || gen_random_uuid()::text, $4, 10, 'a.fit', $5)`,
            [
                userId,
                overrides.activityId ?? null,
                overrides.format ?? 'fit',
                overrides.sha256 ?? 'hash-1',
                overrides.status ?? 'parsed',
            ]
        )
    }

    it('rejects a duplicate sha256 for one user and accepts it for another', async () => {
        const userId = await createUser(testDb)
        const other = await createUser(testDb)
        await insertFile(userId, { sha256: 'same' })

        await expect(insertFile(userId, { sha256: 'same' })).rejects.toThrow(UNIQUE_ERROR)
        await expect(insertFile(other, { sha256: 'same' })).resolves.toBeUndefined()
    })

    it('rejects a format outside fit, tcx and gpx', async () => {
        const userId = await createUser(testDb)

        await expect(insertFile(userId, { format: 'zip' })).rejects.toThrow(CHECK_ERROR)
    })

    it('rejects a status outside parsed and failed', async () => {
        const userId = await createUser(testDb)

        await expect(insertFile(userId, { status: 'pending' })).rejects.toThrow(CHECK_ERROR)
    })

    it("rejects a file row that points at another user's activity", async () => {
        const owner = await createUser(testDb)
        const other = await createUser(testDb)
        const activityId = await insertActivity(testDb, owner)

        await expect(insertFile(other, { activityId })).rejects.toThrow(/foreign key/u)
    })
})

describe('deleting a user', () => {
    it('cascades to every table and leaves other users untouched', async () => {
        const doomed = await createUser(testDb)
        const survivor = await createUser(testDb)
        await seedUserGraph(testDb, doomed)
        await seedUserGraph(testDb, survivor)
        const seeded = Object.fromEntries(USER_TABLES.map((table) => [table, 1]))
        const emptied = Object.fromEntries(USER_TABLES.map((table) => [table, 0]))

        expect(await countEveryTable(doomed)).toEqual(seeded)

        await testDb.asSuperuser()
        await testDb.db.query('delete from auth.users where id = $1', [doomed])

        expect(await countEveryTable(doomed)).toEqual(emptied)
        expect(await countEveryTable(survivor)).toEqual(seeded)
    })
})
