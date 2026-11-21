import type { TestDb } from '@db/tests/helpers/pglite'

type IdRow = { id: string }
type CountRow = { count: number }
type RowBuilder = (graph: UserGraph) => Statement

// The ids of one user's seeded rows, used to aim inserts at that user's parents.
export type UserGraph = {
    userId: string
    activityId: string
    raceId: string
    conversationId: string
}

export type Statement = { sql: string; params: unknown[] }

// One insert per user-owned table, aimed at the graph's user and parents. Tests run these as other
// roles to prove who may write where. Week, weekday and lap index differ from the seeded rows so a
// statement that is allowed does not collide with them.
const ROW_BUILDERS = new Map<string, RowBuilder>([
    [
        'activities',
        (graph) => ({
            sql: `insert into roxcoach.activities (user_id, source, category, name, started_at, local_date)
                  values ($1, 'manual', 'run', 'Recovery run', now(), current_date)`,
            params: [graph.userId],
        }),
    ],
    [
        'races',
        (graph) => ({
            sql: `insert into roxcoach.races (user_id, name, race_type, race_date, distance_m, target_time_s)
                  values ($1, '5k', 'running', current_date + 60, 5000, 1500)`,
            params: [graph.userId],
        }),
    ],
    [
        'athlete_profiles',
        (graph) => ({
            sql: `insert into roxcoach.athlete_profiles (user_id, display_name) values ($1, 'Athlete')`,
            params: [graph.userId],
        }),
    ],
    [
        'availability_slots',
        (graph) => ({
            sql: `insert into roxcoach.availability_slots (user_id, weekday, session_kind, is_fixed)
                  values ($1, 2, 'hyrox', true)`,
            params: [graph.userId],
        }),
    ],
    [
        'activity_laps',
        (graph) => ({
            sql: `insert into roxcoach.activity_laps (user_id, activity_id, lap_index) values ($1, $2, 0)`,
            params: [graph.userId, graph.activityId],
        }),
    ],
    [
        'station_results',
        (graph) => ({
            sql: `insert into roxcoach.station_results (user_id, activity_id, station)
                  values ($1, $2, 'ski_erg')`,
            params: [graph.userId, graph.activityId],
        }),
    ],
    [
        'strength_sets',
        (graph) => ({
            sql: `insert into roxcoach.strength_sets (user_id, activity_id, exercise, set_index)
                  values ($1, $2, 'Back squat', 1)`,
            params: [graph.userId, graph.activityId],
        }),
    ],
    [
        'activity_files',
        (graph) => ({
            sql: `insert into roxcoach.activity_files
                    (user_id, activity_id, format, storage_path, sha256, size_bytes, original_name, status)
                  values ($1::uuid, $2, 'fit', $1::uuid::text || '/' || gen_random_uuid()::text || '.fit',
                          md5(random()::text) || md5(random()::text), 1024, 'run.fit', 'parsed')`,
            params: [graph.userId, graph.activityId],
        }),
    ],
    [
        'coach_conversations',
        (graph) => ({
            sql: `insert into roxcoach.coach_conversations (user_id, title) values ($1, 'Another chat')`,
            params: [graph.userId],
        }),
    ],
    [
        'coach_messages',
        (graph) => ({
            sql: `insert into roxcoach.coach_messages (user_id, conversation_id, role, content)
                  values ($1, $2, 'user', 'How was my week?')`,
            params: [graph.userId, graph.conversationId],
        }),
    ],
    [
        'coach_usage',
        (graph) => ({
            sql: `insert into roxcoach.coach_usage (user_id, day, message_count)
                  values ($1, current_date, 1)`,
            params: [graph.userId],
        }),
    ],
    [
        'lyfta_connections',
        (graph) => ({
            sql: `insert into roxcoach.lyfta_connections (user_id, encrypted_api_key)
                  values ($1, 'encrypted-test-fixture')`,
            params: [graph.userId],
        }),
    ],
    [
        'zepp_connections',
        (graph) => ({
            sql: `insert into roxcoach.zepp_connections (user_id, encrypted_app_token)
                  values ($1, 'encrypted-test-fixture')`,
            params: [graph.userId],
        }),
    ],
])

// Seeded after the parents, in this order (coach_messages needs the conversation).
const GRAPH_CHILD_TABLES = [
    'athlete_profiles',
    'availability_slots',
    'activity_laps',
    'station_results',
    'strength_sets',
    'activity_files',
    'coach_messages',
    'coach_usage',
    'lyfta_connections',
    'zepp_connections',
]

// Inserts an auth user as the superuser, then hands control back to the service role.
export async function createUser(testDb: TestDb): Promise<string> {
    const userId = crypto.randomUUID()
    await testDb.asSuperuser()
    await testDb.db.query('insert into auth.users (id, raw_app_meta_data) values ($1, $2)', [
        userId,
        { roxcoach: true },
    ])
    await testDb.asService()
    return userId
}

async function insertId(testDb: TestDb, sql: string, params: unknown[]): Promise<string> {
    const result = await testDb.db.query<IdRow>(sql, params)
    return result.rows[0].id
}

export async function insertActivity(testDb: TestDb, userId: string): Promise<string> {
    return insertId(
        testDb,
        `insert into roxcoach.activities (user_id, source, category, name, started_at, local_date)
         values ($1, 'manual', 'run', 'Easy run', now(), current_date) returning id`,
        [userId]
    )
}

export async function insertRace(testDb: TestDb, userId: string): Promise<string> {
    return insertId(
        testDb,
        `insert into roxcoach.races (user_id, name, race_type, race_date, distance_m, target_time_s)
         values ($1, '10k', 'running', current_date + 30, 10000, 4200) returning id`,
        [userId]
    )
}

export async function insertConversation(testDb: TestDb, userId: string): Promise<string> {
    return insertId(
        testDb,
        `insert into roxcoach.coach_conversations (user_id, title) values ($1, 'Weekly review')
         returning id`,
        [userId]
    )
}

export async function insertMessage(
    testDb: TestDb,
    userId: string,
    conversationId: string,
    role = 'user'
): Promise<string> {
    return insertId(
        testDb,
        `insert into roxcoach.coach_messages (user_id, conversation_id, role, content)
         values ($1, $2, $3, 'Hello coach') returning id`,
        [userId, conversationId, role]
    )
}

// Inserts the parents (activity, race, conversation), then one row in every other user-owned table, so
// the user owns exactly one row per table..
export async function seedUserGraph(testDb: TestDb, userId: string): Promise<UserGraph> {
    const graph: UserGraph = {
        userId,
        activityId: await insertActivity(testDb, userId),
        raceId: await insertRace(testDb, userId),
        conversationId: await insertConversation(testDb, userId),
    }
    for (const table of GRAPH_CHILD_TABLES) {
        const statement = rowInsert(table, graph)
        // oxlint-disable-next-line no-await-in-loop -- inserts must run in order on one connection
        await testDb.db.query(statement.sql, statement.params)
    }
    return graph
}

// Throws for a table with no builder, so a table added to the schema without a fixture fails the
// suites that iterate over every table.
export function rowInsert(table: string, graph: UserGraph): Statement {
    const build = ROW_BUILDERS.get(table)
    if (build === undefined) {
        throw new Error(`No fixture insert for roxcoach.${table}`)
    }
    return build(graph)
}

export async function countRows(testDb: TestDb, table: string, userId: string): Promise<number> {
    const result = await testDb.db.query<CountRow>(
        `select count(*)::int as count from roxcoach.${table} where user_id = $1`,
        [userId]
    )
    return result.rows[0].count
}
