// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
    countRows,
    createUser,
    insertActivity,
    insertConversation,
    insertMessage,
    insertRace,
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
    'coach_conversations',
    'coach_messages',
    'lyfta_connections',
    'races',
    'schema_migrations',
    'station_results',
    'strength_sets',
]

const USER_TABLES = ROXCOACH_TABLES.filter((table) => table !== 'schema_migrations')

// Tables only the service role may touch: 0006 and 0010 revoke client privileges.
const SERVICE_ONLY_TABLES = new Set(['lyfta_connections', 'schema_migrations'])

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
            '0009_coach_chat.sql',
            '0010_lyfta.sql',
            '0011_lyfta_progress_metrics.sql',
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

    it('lets authenticated write user tables but not service-only tables', async () => {
        await testDb.asSuperuser()
        const result = await testDb.db.query<{
            activities: boolean
            lyftaConnections: boolean
            migrations: boolean
        }>(
            `select
                has_table_privilege('authenticated', 'roxcoach.activities', 'insert, update, delete') as activities,
                has_table_privilege('authenticated', 'roxcoach.lyfta_connections', 'select, insert, update, delete') as "lyftaConnections",
                has_table_privilege('authenticated', 'roxcoach.schema_migrations', 'insert, update, delete') as migrations`
        )

        expect(result.rows[0]).toEqual({
            activities: true,
            lyftaConnections: false,
            migrations: false,
        })
    })

    it('retains the old activity source labels and adds lyfta', async () => {
        await testDb.asSuperuser()
        const result = await testDb.db.query<{ enumlabel: string }>(
            `select e.enumlabel
             from pg_enum e
             join pg_type t on t.oid = e.enumtypid
             join pg_namespace n on n.oid = t.typnamespace
             where n.nspname = 'roxcoach' and t.typname = 'activity_source'
             order by e.enumsortorder`
        )

        expect(result.rows.map((row) => row.enumlabel)).toEqual(['strava', 'manual', 'lyfta'])
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

    it('accepts many manual activities for one user', async () => {
        const userId = await createUser(testDb)
        await insertActivity(testDb, userId)

        await expect(insertActivity(testDb, userId)).resolves.toBeDefined()
    })

    it('uniquely identifies Lyfta workouts per user and allows null source ids', async () => {
        const userId = await createUser(testDb)
        const otherUserId = await createUser(testDb)
        const insert = (ownerId: string, sourceId: string | null) =>
            testDb.db.query(
                `insert into roxcoach.activities
                    (user_id, source, source_id, category, name, started_at, local_date)
                 values ($1, 'lyfta', $2, 'strength', 'Gym workout', now(), current_date)`,
                [ownerId, sourceId]
            )

        await insert(userId, '501')
        await expect(insert(userId, '501')).rejects.toThrow(UNIQUE_ERROR)
        await expect(insert(otherUserId, '501')).resolves.toBeDefined()
        await expect(insert(userId, null)).resolves.toBeDefined()
        await expect(insert(userId, null)).resolves.toBeDefined()
    })
})

describe('Lyfta connections', () => {
    it('keeps Lyfta credentials service-only and maintains updated_at', async () => {
        const userId = await createUser(testDb)

        await testDb.asService()
        await testDb.db.query(
            `insert into roxcoach.lyfta_connections (user_id, encrypted_api_key)
             values ($1, 'encrypted-fixture')`,
            [userId]
        )
        await testDb.asUser(userId)
        await expect(
            testDb.db.query('select * from roxcoach.lyfta_connections')
        ).rejects.toMatchObject({ code: '42501' })
        await expect(
            testDb.db.query(
                `insert into roxcoach.lyfta_connections (user_id, encrypted_api_key)
                 values ($1, 'not-client-writable')`,
                [userId]
            )
        ).rejects.toMatchObject({ code: '42501' })
    })

    describe('Lyfta progress metrics', () => {
        it('stores source exercise IDs, RIR and workout metrics in kilograms', async () => {
            const userId = await createUser(testDb)
            const activityId = await insertActivity(testDb, userId)

            await testDb.db.query(
                `update roxcoach.activities
                 set body_weight_kg = 72.5, lyfta_total_volume_kg_reps = 1840
                 where id = $1 and user_id = $2`,
                [activityId, userId]
            )
            await testDb.db.query(
                `insert into roxcoach.strength_sets
                    (user_id, activity_id, exercise, source_exercise_id, set_index, reps, load_kg, rir)
                 values ($1, $2, 'Bench Press', '501', 1, 5, 80, 2)`,
                [userId, activityId]
            )

            const result = await testDb.db.query<{
                source_exercise_id: string
                load_kg: string
                rir: number
                body_weight_kg: string
                lyfta_total_volume_kg_reps: string
            }>(
                `select s.source_exercise_id, s.load_kg, s.rir,
                        a.body_weight_kg, a.lyfta_total_volume_kg_reps
                 from roxcoach.strength_sets s
                 join roxcoach.activities a on a.id = s.activity_id and a.user_id = s.user_id
                 where s.user_id = $1`,
                [userId]
            )

            expect(result.rows).toEqual([
                {
                    source_exercise_id: '501',
                    load_kg: '80',
                    rir: 2,
                    body_weight_kg: '72.5',
                    lyfta_total_volume_kg_reps: '1840',
                },
            ])
            await expect(
                testDb.db.query(
                    `insert into roxcoach.strength_sets
                        (user_id, activity_id, exercise, source_exercise_id, set_index, rir)
                     values ($1, $2, 'Bench Press', '501', 2, -1)`,
                    [userId, activityId]
                )
            ).rejects.toThrow(CHECK_ERROR)
        })
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

describe('coach chat tables', () => {
    it('rejects a role outside user and assistant', async () => {
        const userId = await createUser(testDb)
        const conversationId = await insertConversation(testDb, userId)

        await expect(insertMessage(testDb, userId, conversationId, 'system')).rejects.toThrow(
            CHECK_ERROR
        )
        await expect(
            insertMessage(testDb, userId, conversationId, 'assistant')
        ).resolves.toBeDefined()
    })

    it('deletes the messages of a deleted conversation', async () => {
        const userId = await createUser(testDb)
        const conversationId = await insertConversation(testDb, userId)
        await insertMessage(testDb, userId, conversationId)
        await insertMessage(testDb, userId, conversationId, 'assistant')

        await testDb.db.query('delete from roxcoach.coach_conversations where id = $1', [
            conversationId,
        ])

        expect(await countRows(testDb, 'coach_messages', userId)).toBe(0)
    })

    it('no longer has the report and plan tables or their enum types', async () => {
        await testDb.asSuperuser()
        const types = await testDb.db.query<{ typname: string }>(
            `select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
             where n.nspname = 'roxcoach' and t.typname in ('report_status', 'planned_session_status')`
        )

        expect(types.rows).toEqual([])
        expect(ROXCOACH_TABLES).not.toContain('weekly_reports')
        expect(ROXCOACH_TABLES).not.toContain('planned_sessions')
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
