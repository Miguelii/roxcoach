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
        const [, details] = vi.mocked(console.error).mock.calls[0] ?? []
        expect(details).toMatchObject({ metadata: { token: '[redacted]', count: 2 } })
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

    it.each([
        'x-api-key',
        'api-key',
        'API_KEY',
        'apiKey',
        'private_key',
        'privateKey',
        'private-key',
        'credentials',
        'Credential',
        'Bearer',
        'x-auth-token',
        'Set-Cookie',
        'client secret',
        'refreshToken',
        'serviceRole',
        'service-role-key',
    ])('redacts the value of the key %s', (key) => {
        Logger({ level: 'error', prefix: 'test', error: { [key]: SECRETS[5], safe: 'visible' } })

        const output = printed(vi.mocked(console.error))
        expect(output).not.toContain(SECRETS[5])
        expect(output).toContain('visible')
    })

    it('redacts hyphenated and camelCase keys in metadata too', () => {
        Logger({
            level: 'error',
            prefix: 'test',
            metadata: { 'x-api-key': SECRETS[4], privateKey: SECRETS[5] },
        })

        const output = printed(vi.mocked(console.error))
        expect(output).not.toContain(SECRETS[4])
        expect(output).not.toContain(SECRETS[5])
    })

    it('marks repeated references as circular on a wide cyclic graph', () => {
        type Node = { token: string; children: Node[]; parent?: Node }
        const root: Node = { token: SECRETS[3] ?? '', children: [] }
        for (let i = 0; i < 6; i += 1) {
            const child: Node = { token: SECRETS[3] ?? '', children: [root], parent: root }
            root.children.push(child, root)
        }

        expect(() => Logger({ level: 'error', prefix: 'test', error: root })).not.toThrow()

        const output = printed(vi.mocked(console.error))
        expect(output).not.toContain(SECRETS[3])
        expect(output).toContain('[circular]')
        // The depth cap alone would unfold this graph exponentially: the seen-set keeps it small
        expect(output.length).toBeLessThan(5_000)
    })

    it('prints a reference shared by two parents once and marks the repeat', () => {
        const shared = { value: 'shared-visible' }

        Logger({ level: 'error', prefix: 'test', error: { a: shared, b: shared } })

        const output = printed(vi.mocked(console.error))
        expect(output.match(/shared-visible/gu)).toHaveLength(1)
        expect(output).toContain('[circular]')
    })

    it('never throws and never prints a secret when a getter throws', () => {
        const error = {
            token: SECRETS[3],
            note: SECRETS[5],
            get boom(): string {
                throw new Error(`getter exploded with ${SECRETS[5]}`)
            },
        }
        Object.defineProperty(error, 'boom', { enumerable: true })

        expect(() => Logger({ level: 'error', prefix: 'ctx', error })).not.toThrow()

        const output = printed(vi.mocked(console.error))
        expect(output).not.toContain(SECRETS[3])
        expect(output).not.toContain(SECRETS[5])
        expect(output).toContain('[ctx]')
        expect(output).toContain('serializationFailed')
    })

    it('never throws and never prints a secret when a Proxy traps throw', () => {
        const trap = () => {
            throw new Error(`proxy exploded with ${SECRETS[5]}`)
        }
        const proxy = new Proxy(
            { token: SECRETS[3] },
            { ownKeys: trap, get: trap, getOwnPropertyDescriptor: trap }
        )

        expect(() => Logger({ level: 'error', prefix: 'ctx', error: proxy })).not.toThrow()
        expect(() =>
            Logger({ level: 'error', prefix: 'ctx', metadata: { value: proxy } })
        ).not.toThrow()

        const output = printed(vi.mocked(console.error))
        expect(output).not.toContain(SECRETS[3])
        expect(output).not.toContain(SECRETS[5])
        expect(output).toContain('serializationFailed')
    })

    it('falls back on the requested console level', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const proxy = new Proxy(
            {},
            {
                ownKeys: () => {
                    throw new Error('trap')
                },
            }
        )

        expect(() => Logger({ level: 'warn', prefix: 'ctx', error: proxy })).not.toThrow()

        expect(warn).toHaveBeenCalledWith('[ctx]', { serializationFailed: true })
    })
})
