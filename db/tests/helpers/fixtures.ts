import type { TestDb } from '@db/tests/helpers/pglite'

type IdRow = { id: string }
type CountRow = { count: number }

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

export async function insertActivity(
    testDb: TestDb,
    userId: string,
    stravaId: number | null = null
): Promise<string> {
    return insertId(
        testDb,
        `insert into roxcoach.activities (user_id, source, strava_id, category, name, started_at, local_date)
         values ($1, $2, $3, 'run', 'Easy run', now(), current_date) returning id`,
        [userId, stravaId === null ? 'manual' : 'strava', stravaId]
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

export async function insertReport(
    testDb: TestDb,
    userId: string,
    weekStart = '2026-11-16'
): Promise<string> {
    return insertId(
        testDb,
        `insert into roxcoach.weekly_reports (user_id, week_start, status, model, prompt_version)
         values ($1, $2, 'generating', 'test-model', 'v1') returning id`,
        [userId, weekStart]
    )
}

export async function insertPlannedSession(
    testDb: TestDb,
    userId: string,
    reportId: string,
    raceId: string | null,
    activityId: string | null
): Promise<string> {
    return insertId(
        testDb,
        `insert into roxcoach.planned_sessions
            (user_id, report_id, race_id, matched_activity_id, planned_date, session_kind, title, description)
         values ($1, $2, $3, $4, current_date, 'run', 'Tempo', 'Run 20 minutes at tempo') returning id`,
        [userId, reportId, raceId, activityId]
    )
}

export async function insertWebhookEvent(
    testDb: TestDb,
    userId: string | null,
    ownerId: number
): Promise<void> {
    await testDb.db.query(
        `insert into roxcoach.strava_webhook_events
            (user_id, object_type, object_id, aspect_type, owner_id, event_time, status)
         values ($1, 'activity', 42, 'create', $2, '2026-11-19T10:00:00Z', 'received')`,
        [userId, ownerId]
    )
}

// One row in every user-owned table for the given user. The Strava athlete id is global, so each
// seeded user needs its own.
export async function seedEveryTable(
    testDb: TestDb,
    userId: string,
    stravaAthleteId: number
): Promise<void> {
    const activityId = await insertActivity(testDb, userId, 1001)
    const raceId = await insertRace(testDb, userId)
    const reportId = await insertReport(testDb, userId)
    await testDb.db.query(
        `insert into roxcoach.athlete_profiles (user_id, display_name) values ($1, 'Athlete')`,
        [userId]
    )
    await testDb.db.query(
        `insert into roxcoach.availability_slots (user_id, weekday, session_kind, is_fixed)
         values ($1, 2, 'hyrox', true)`,
        [userId]
    )
    await testDb.db.query(
        `insert into roxcoach.strava_connections
            (user_id, strava_athlete_id, access_token, refresh_token, expires_at, scope)
         values ($1, $2, 'access', 'refresh', now(), 'activity:read_all')`,
        [userId, stravaAthleteId]
    )
    await insertWebhookEvent(testDb, userId, stravaAthleteId)
    await testDb.db.query(
        `insert into roxcoach.activity_laps (user_id, activity_id, lap_index) values ($1, $2, 0)`,
        [userId, activityId]
    )
    await testDb.db.query(
        `insert into roxcoach.station_results (user_id, activity_id, station) values ($1, $2, 'ski_erg')`,
        [userId, activityId]
    )
    await testDb.db.query(
        `insert into roxcoach.strength_sets (user_id, activity_id, exercise, set_index)
         values ($1, $2, 'Back squat', 1)`,
        [userId, activityId]
    )
    await insertPlannedSession(testDb, userId, reportId, raceId, activityId)
}

export async function countRows(testDb: TestDb, table: string, userId: string): Promise<number> {
    const result = await testDb.db.query<CountRow>(
        `select count(*)::int as count from roxcoach.${table} where user_id = $1`,
        [userId]
    )
    return result.rows[0].count
}
