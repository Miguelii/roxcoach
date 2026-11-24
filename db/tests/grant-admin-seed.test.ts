// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from '@db/tests/helpers/pglite'

type AppMetadata = { provider?: string; roxcoach?: boolean; roxcoach_admin?: boolean }
type MetadataRow = { raw_app_meta_data: AppMetadata }

const SEED_FILE = new URL('../seed/grant-admin.sql', import.meta.url)
const ATHLETE_EMAIL = 'athlete@example.test'
const OUTSIDER_EMAIL = 'outsider@example.test'

let testDb: TestDb
let seedTemplate: string

function seedFor(email: string): string {
    return seedTemplate.replaceAll('<EMAIL>', email)
}

async function metadataOf(email: string): Promise<AppMetadata | undefined> {
    await testDb.asSuperuser()
    const result = await testDb.db.query<MetadataRow>(
        'select raw_app_meta_data from auth.users where email = $1',
        [email]
    )
    return result.rows[0]?.raw_app_meta_data
}

beforeAll(async () => {
    testDb = await createTestDb()
    seedTemplate = await readFile(SEED_FILE, 'utf8')
    await testDb.asSuperuser()
    await testDb.db.query(
        'insert into auth.users (id, email, raw_app_meta_data) values ($1, $2, $3), ($4, $5, $6)',
        [
            crypto.randomUUID(),
            ATHLETE_EMAIL,
            { provider: 'email', roxcoach: true },
            crypto.randomUUID(),
            OUTSIDER_EMAIL,
            { provider: 'email' },
        ]
    )
})

afterAll(async () => {
    await testDb.close()
})

describe('db/seed/grant-admin.sql', () => {
    it('marks the email placeholder so it cannot be run unedited by accident', () => {
        expect(seedTemplate).toContain(`where email = '<EMAIL>'`)
    })

    it('changes nothing when the email matches no user', async () => {
        await testDb.asSuperuser()
        await testDb.db.exec(seedFor('nobody@example.test'))

        expect(await metadataOf(ATHLETE_EMAIL)).toEqual({ provider: 'email', roxcoach: true })
    })

    it('does not make a user without Roxcoach access an admin', async () => {
        await testDb.asSuperuser()
        await testDb.db.exec(seedFor(OUTSIDER_EMAIL))

        expect(await metadataOf(OUTSIDER_EMAIL)).toEqual({ provider: 'email' })
    })

    it('grants the boolean admin flag and keeps the other metadata', async () => {
        await testDb.asSuperuser()
        await testDb.db.exec(seedFor(ATHLETE_EMAIL))

        expect(await metadataOf(ATHLETE_EMAIL)).toEqual({
            provider: 'email',
            roxcoach: true,
            roxcoach_admin: true,
        })
    })

    it('is harmless when run again', async () => {
        await testDb.asSuperuser()
        await testDb.db.exec(seedFor(ATHLETE_EMAIL))

        expect(await metadataOf(ATHLETE_EMAIL)).toEqual({
            provider: 'email',
            roxcoach: true,
            roxcoach_admin: true,
        })
    })
})
