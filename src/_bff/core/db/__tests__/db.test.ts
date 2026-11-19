// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { DB_SCHEMA } from '@/_bff/core/constants/db.constants'
import { createDBAdminClient, createDBServerClient } from '@/_bff/core/db'

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn(() => ({ kind: 'server' })) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ kind: 'admin' })) }))
vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({ getAll: () => [], set: vi.fn() })),
}))

describe('DB clients', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('exposes the roxcoach schema name', () => {
        expect(DB_SCHEMA).toBe('roxcoach')
    })

    it('creates the server client with the publishable key and the roxcoach schema', async () => {
        await createDBServerClient()

        expect(createServerClient).toHaveBeenCalledWith(
            'http://localhost:54321',
            'test-publishable-key',
            expect.objectContaining({ db: { schema: 'roxcoach' } })
        )
    })

    it('creates the server client with the service-role key when requested', async () => {
        await createDBServerClient(true)

        expect(createServerClient).toHaveBeenCalledWith(
            'http://localhost:54321',
            'test-service-role-key',
            expect.objectContaining({ db: { schema: 'roxcoach' } })
        )
    })

    it('creates the admin client with the service-role key and the roxcoach schema', () => {
        createDBAdminClient()

        expect(createClient).toHaveBeenCalledWith(
            'http://localhost:54321',
            'test-service-role-key',
            expect.objectContaining({ db: { schema: 'roxcoach' } })
        )
    })
})
