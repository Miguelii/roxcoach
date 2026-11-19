// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from '@db/tests/helpers/pglite'

type UserRow = { raw_app_meta_data: { provider?: string; roxcoach?: boolean } }
type ProfileRow = { user_id: string; display_name: string }

const SEED_FILE = new URL('../seed/grant-access.sql', import.meta.url)
const EMAIL = 'athlete@example.test'

let testDb: TestDb
let seedTemplate: string

// Fills the placeholders the way the README tells the operator to.
function seedFor(email: string): string {
    return seedTemplate.replaceAll('<EMAIL>', email).replaceAll('<DISPLAY_NAME>', 'Test Athlete')
}

async function profiles(): Promise<ProfileRow[]> {
    await testDb.asSuperuser()
    const result = await testDb.db.query<ProfileRow>(
        'select user_id, display_name from roxcoach.athlete_profiles order by user_id'
    )
    return result.rows
}

beforeAll(async () => {
    testDb = await createTestDb()
    seedTemplate = await readFile(SEED_FILE, 'utf8')
})

afterAll(async () => {
    await testDb.close()
})

describe('db/seed/grant-access.sql', () => {
    const userId = crypto.randomUUID()

    it('marks both placeholders so it cannot be run unedited by accident', () => {
        expect(seedTemplate).toContain(`where email = '<EMAIL>'`)
        expect(seedTemplate).toContain(`'<DISPLAY_NAME>'`)
    })

    it('changes nothing when the email matches no user', async () => {
        await testDb.asSuperuser()
        await testDb.db.query(
            'insert into auth.users (id, email, raw_app_meta_data) values ($1, $2, $3)',
            [userId, EMAIL, { provider: 'email' }]
        )
        await testDb.db.exec(seedFor('nobody@example.test'))

        const user = await testDb.db.query<UserRow>(
            'select raw_app_meta_data from auth.users where id = $1',
            [userId]
        )
        expect(user.rows).toEqual([{ raw_app_meta_data: { provider: 'email' } }])
        expect(await profiles()).toEqual([])
    })

    it('grants the boolean flag, keeps other metadata and creates the profile', async () => {
        await testDb.asSuperuser()
        await testDb.db.exec(seedFor(EMAIL))

        const user = await testDb.db.query<UserRow>(
            'select raw_app_meta_data from auth.users where id = $1',
            [userId]
        )
        expect(user.rows).toEqual([{ raw_app_meta_data: { provider: 'email', roxcoach: true } }])
        expect(await profiles()).toEqual([{ user_id: userId, display_name: 'Test Athlete' }])
    })

    it('is harmless when run again', async () => {
        await testDb.asSuperuser()
        await testDb.db.exec(seedFor(EMAIL))

        expect(await profiles()).toEqual([{ user_id: userId, display_name: 'Test Athlete' }])
    })

    it('lets the user read the profile once the flag is in the JWT', async () => {
        await testDb.asUser(userId)
        const result = await testDb.db.query<ProfileRow>(
            'select user_id, display_name from roxcoach.athlete_profiles'
        )

        expect(result.rows).toEqual([{ user_id: userId, display_name: 'Test Athlete' }])
    })
})
