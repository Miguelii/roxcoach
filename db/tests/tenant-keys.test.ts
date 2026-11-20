// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createUser, insertActivity, insertConversation } from '@db/tests/helpers/fixtures'
import { createTestDb, type TestDb } from '@db/tests/helpers/pglite'

const FOREIGN_KEY_ERROR = /foreign key/u

let testDb: TestDb

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

    it("rejects a message that points at another user's conversation", async () => {
        const owner = await createUser(testDb)
        const other = await createUser(testDb)
        const conversationId = await insertConversation(testDb, owner)

        await expect(
            testDb.db.query(
                `insert into roxcoach.coach_messages (user_id, conversation_id, role, content)
                 values ($1, $2, 'user', 'Hi')`,
                [other, conversationId]
            )
        ).rejects.toThrow(FOREIGN_KEY_ERROR)
    })
})
