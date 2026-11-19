// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
    createUser,
    insertActivity,
    insertPlannedSession,
    insertRace,
    insertReport,
} from '@db/tests/helpers/fixtures'
import { createTestDb, type TestDb } from '@db/tests/helpers/pglite'

type PlannedLinkRow = {
    user_id: string
    race_id: string | null
    matched_activity_id: string | null
}

const FOREIGN_KEY_ERROR = /foreign key/u

let testDb: TestDb

async function plannedLinks(sessionId: string): Promise<PlannedLinkRow[]> {
    const result = await testDb.db.query<PlannedLinkRow>(
        'select user_id, race_id, matched_activity_id from roxcoach.planned_sessions where id = $1',
        [sessionId]
    )
    return result.rows
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

describe('composite foreign keys keep tenants apart (as the service role)', () => {
    it('rejects a lap whose user_id differs from its activity', async () => {
        const owner = await createUser(testDb)
        const other = await createUser(testDb)
        const activityId = await insertActivity(testDb, owner)

        await expect(
            testDb.db.query(
                'insert into roxcoach.activity_laps (user_id, activity_id, lap_index) values ($1, $2, 0)',
                [other, activityId]
            )
        ).rejects.toThrow(FOREIGN_KEY_ERROR)
    })

    it('rejects a station result whose user_id differs from its activity', async () => {
        const owner = await createUser(testDb)
        const other = await createUser(testDb)
        const activityId = await insertActivity(testDb, owner)

        await expect(
            testDb.db.query(
                `insert into roxcoach.station_results (user_id, activity_id, station)
                 values ($1, $2, 'wall_balls')`,
                [other, activityId]
            )
        ).rejects.toThrow(FOREIGN_KEY_ERROR)
    })

    it('rejects a strength set whose user_id differs from its activity', async () => {
        const owner = await createUser(testDb)
        const other = await createUser(testDb)
        const activityId = await insertActivity(testDb, owner)

        await expect(
            testDb.db.query(
                `insert into roxcoach.strength_sets (user_id, activity_id, exercise, set_index)
                 values ($1, $2, 'Deadlift', 1)`,
                [other, activityId]
            )
        ).rejects.toThrow(FOREIGN_KEY_ERROR)
    })

    it('rejects a planned session pointing at another user report', async () => {
        const owner = await createUser(testDb)
        const other = await createUser(testDb)
        const reportId = await insertReport(testDb, owner)

        await expect(insertPlannedSession(testDb, other, reportId, null, null)).rejects.toThrow(
            FOREIGN_KEY_ERROR
        )
    })

    it('rejects a planned session pointing at another user race', async () => {
        const owner = await createUser(testDb)
        const other = await createUser(testDb)
        const raceId = await insertRace(testDb, owner)
        const reportId = await insertReport(testDb, other)

        await expect(insertPlannedSession(testDb, other, reportId, raceId, null)).rejects.toThrow(
            FOREIGN_KEY_ERROR
        )
    })

    it('rejects a planned session matched to another user activity', async () => {
        const owner = await createUser(testDb)
        const other = await createUser(testDb)
        const activityId = await insertActivity(testDb, owner)
        const reportId = await insertReport(testDb, other)

        await expect(
            insertPlannedSession(testDb, other, reportId, null, activityId)
        ).rejects.toThrow(FOREIGN_KEY_ERROR)
    })
})

describe('optional links clear only the link column', () => {
    it('clears only race_id when the race is deleted', async () => {
        const userId = await createUser(testDb)
        const raceId = await insertRace(testDb, userId)
        const reportId = await insertReport(testDb, userId)
        const sessionId = await insertPlannedSession(testDb, userId, reportId, raceId, null)

        await testDb.db.query('delete from roxcoach.races where id = $1', [raceId])

        expect(await plannedLinks(sessionId)).toEqual([
            { user_id: userId, race_id: null, matched_activity_id: null },
        ])
    })

    it('clears only matched_activity_id when the activity is deleted', async () => {
        const userId = await createUser(testDb)
        const raceId = await insertRace(testDb, userId)
        const activityId = await insertActivity(testDb, userId)
        const reportId = await insertReport(testDb, userId)
        const sessionId = await insertPlannedSession(testDb, userId, reportId, raceId, activityId)

        await testDb.db.query('delete from roxcoach.activities where id = $1', [activityId])

        expect(await plannedLinks(sessionId)).toEqual([
            { user_id: userId, race_id: raceId, matched_activity_id: null },
        ])
    })
})
