// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { LOG_RANGE_MS, LOGS_FETCH_LIMIT } from '@/_bff/core/constants/logs.constants'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { makeFakeAdminDb, type Json } from '@/_bff/lib/fake-admin-db'
import { asPublicClient, failureTag } from '@/_bff/lib/tests-utils'
import { getLogs } from '@/_bff/modules/logs/services/get-logs.service'

const NOW = new Date('2026-11-23T12:00:00.000Z')

const row = (index: number): Json => ({
    id: `id-${index}`,
    created_at: NOW.toISOString(),
    level: 'info',
    prefix: 'zeppSync',
    message: 'Sync succeeded',
    metadata: null,
    user_id: null,
})

const rows = (count: number): Json => Array.from({ length: count }, (_, index) => row(index))

const run = (
    input: { range: '30m' | '1h' | '24h' | '7d' | '30d'; search?: string },
    data: Json,
    error: { code: string; message: string } | null = null
) => {
    const db = makeFakeAdminDb(() => ({ data, error }))
    const exit = Effect.runPromiseExit(
        getLogs(input, { createClient: () => asPublicClient(db.supabase), now: () => NOW })
    )
    return { db, exit }
}

describe('getLogs', () => {
    it('reads from the start of the range', async () => {
        const { db, exit } = run({ range: '24h' }, rows(2))

        await exit

        expect(db.calls[0].filters).toContainEqual([
            'created_at:gte',
            new Date(NOW.getTime() - LOG_RANGE_MS['24h']).toISOString(),
        ])
    })

    it('reports the range as truncated only at the fetch limit', async () => {
        const below = await Effect.runPromise(
            getLogs(
                { range: '1h' },
                {
                    createClient: () =>
                        asPublicClient(
                            makeFakeAdminDb(() => ({
                                data: rows(LOGS_FETCH_LIMIT - 1),
                                error: null,
                            })).supabase
                        ),
                    now: () => NOW,
                }
            )
        )
        const atLimit = await Effect.runPromise(
            getLogs(
                { range: '1h' },
                {
                    createClient: () =>
                        asPublicClient(
                            makeFakeAdminDb(() => ({ data: rows(LOGS_FETCH_LIMIT), error: null }))
                                .supabase
                        ),
                    now: () => NOW,
                }
            )
        )

        expect(below.isTruncated).toBe(false)
        expect(below.logs).toHaveLength(LOGS_FETCH_LIMIT - 1)
        expect(atLimit.isTruncated).toBe(true)
    })

    it('treats an empty result as no logs', async () => {
        const { exit } = run({ range: '1h' }, null)

        expect(await exit).toMatchObject({ value: { logs: [], isTruncated: false } })
    })

    it('ignores an empty search string', async () => {
        const { db, exit } = run({ range: '1h', search: '' }, [])

        await exit

        expect(db.calls[0].filters.some(([column]) => column === 'or')).toBe(false)
    })

    it('fails with LogsQueryError and the query code when the database answers an error', async () => {
        const { exit } = run({ range: '1h' }, null, { code: 'XX001', message: 'boom' })

        const settled = await exit
        expect(failureTag(settled)).toBe('LogsQueryError')
        expect(JSON.stringify(settled)).toContain(ErrorCode.LOGS_QUERY)
    })

    it('fails with LogsClientError when the client cannot be created', async () => {
        const exit = await Effect.runPromiseExit(
            getLogs(
                { range: '1h' },
                {
                    createClient: () => {
                        throw new Error('no env')
                    },
                    now: () => NOW,
                }
            )
        )

        expect(failureTag(exit)).toBe('LogsClientError')
    })
})
