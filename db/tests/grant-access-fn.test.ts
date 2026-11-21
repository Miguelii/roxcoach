// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from '@db/tests/helpers/pglite'

type UserRow = { raw_app_meta_data: { provider?: string; roxcoach?: boolean } }
type ProfileRow = { user_id: string; display_name: string }

let testDb: TestDb
const userId = crypto.randomUUID()

async function user(): Promise<UserRow[]> {
    await testDb.asSuperuser()
    const result = await testDb.db.query<UserRow>(
        'select raw_app_meta_data from auth.users where id = $1',
        [userId]
    )
    return result.rows
}

async function profiles(): Promise<ProfileRow[]> {
    await testDb.asSuperuser()
    const result = await testDb.db.query<ProfileRow>(
        'select user_id, display_name from roxcoach.athlete_profiles'
    )
    return result.rows
}

beforeAll(async () => {
    testDb = await createTestDb()
    await testDb.asSuperuser()
    await testDb.db.query(
        'insert into auth.users (id, email, raw_app_meta_data) values ($1, $2, $3)',
        [userId, 'new@example.test', { provider: 'email' }]
    )
})

afterAll(async () => {
    await testDb.close()
})

describe('roxcoach.grant_access', () => {
    it('is not callable by anon or authenticated users', async () => {
        await testDb.asAnon()
        await expect(
            testDb.db.query('select roxcoach.grant_access($1, $2)', [userId, 'Anon'])
        ).rejects.toThrow(/permission denied/u)

        await testDb.asUser(userId, { access: false })
        await expect(
            testDb.db.query('select roxcoach.grant_access($1, $2)', [userId, 'Self'])
        ).rejects.toThrow(/permission denied/u)

        expect(await user()).toEqual([{ raw_app_meta_data: { provider: 'email' } }])
        expect(await profiles()).toEqual([])
    })

    it('raises for an unknown user and writes nothing', async () => {
        await testDb.asService()
        await expect(
            testDb.db.query('select roxcoach.grant_access($1, $2)', [crypto.randomUUID(), 'Ghost'])
        ).rejects.toThrow(/does not exist/u)

        expect(await profiles()).toEqual([])
    })

    it('sets the flag, keeps other metadata and creates the profile', async () => {
        await testDb.asService()
        await testDb.db.query('select roxcoach.grant_access($1, $2)', [userId, 'New Athlete'])

        expect(await user()).toEqual([{ raw_app_meta_data: { provider: 'email', roxcoach: true } }])
        expect(await profiles()).toEqual([{ user_id: userId, display_name: 'New Athlete' }])
    })

    it('is harmless when run again and keeps the first display name', async () => {
        await testDb.asService()
        await testDb.db.query('select roxcoach.grant_access($1, $2)', [userId, 'Other Name'])

        expect(await user()).toEqual([{ raw_app_meta_data: { provider: 'email', roxcoach: true } }])
        expect(await profiles()).toEqual([{ user_id: userId, display_name: 'New Athlete' }])
    })
})
