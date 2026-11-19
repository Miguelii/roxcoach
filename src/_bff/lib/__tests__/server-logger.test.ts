import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Data } from 'effect'
import { Logger } from '@/_bff/lib/server-logger'

class SomeError extends Data.TaggedError('SomeError')<{ cause: unknown }> {}

const SECRETS = ['pw-123', 'at-456', 'rt-789', 'tok-abc', 'sec-def', 'deep-ghi']

const printed = (spy: ReturnType<typeof vi.spyOn>) => JSON.stringify(spy.mock.calls)

describe('Logger', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('redacts sensitive keys inside an error cause and never prints their values', () => {
        const error = new Error('request failed', {
            cause: {
                password: SECRETS[0],
                access_token: SECRETS[1],
                refresh_token: SECRETS[2],
                token: SECRETS[3],
                secret: SECRETS[4],
                safe: 'visible',
            },
        })

        Logger({ level: 'error', prefix: 'test', error })

        const output = printed(vi.mocked(console.error))
        SECRETS.slice(0, 5).forEach((secret) => expect(output).not.toContain(secret))
        expect(output).toContain('[redacted]')
        expect(output).toContain('visible')
    })

    it('redacts at any nesting depth, case-insensitively', () => {
        const error = { a: { b: [{ c: { Password: SECRETS[5], ACCESS_TOKEN: SECRETS[1] } }] } }

        Logger({ level: 'error', prefix: 'test', error })

        const output = printed(vi.mocked(console.error))
        expect(output).not.toContain(SECRETS[5])
        expect(output).not.toContain(SECRETS[1])
        expect(output).toContain('[redacted]')
    })

    it('redacts metadata and tagged errors with a nested cause', () => {
        const tagged = new SomeError({ cause: { refresh_token: SECRETS[2] } })

        Logger({
            level: 'error',
            prefix: 'test',
            error: tagged,
            metadata: { token: SECRETS[3], count: 2 },
        })

        const output = printed(vi.mocked(console.error))
        expect(output).not.toContain(SECRETS[2])
        expect(output).not.toContain(SECRETS[3])
        expect(output).toContain('SomeError')
        expect(output).toContain('2')
    })

    it('survives circular references', () => {
        const error = { token: SECRETS[3], self: {} }
        error.self = error

        expect(() => Logger({ level: 'error', prefix: 'test', error })).not.toThrow()
        expect(printed(vi.mocked(console.error))).not.toContain(SECRETS[3])
    })

    it('logs the prefix, message and user id', () => {
        Logger({ level: 'error', prefix: 'auth', message: 'failed', userId: 'user-1' })

        const [header, details] = vi.mocked(console.error).mock.calls[0] ?? []
        expect(header).toBe('[auth] failed')
        expect(details).toMatchObject({ userId: 'user-1' })
    })
})
