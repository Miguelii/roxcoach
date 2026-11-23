// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { LOGS_FETCH_LIMIT } from '@/_bff/core/constants/logs.constants'
import { makeFakeAdminDb, ok } from '@/_bff/lib/fake-admin-db'
import { asPublicClient } from '@/_bff/lib/tests-utils'
import { selectLogs } from '@/_bff/modules/logs/repositories/logs.repository'

const SINCE = '2026-11-23T09:00:00.000Z'

describe('selectLogs', () => {
    it('reads only Roxcoach rows since the bound, newest first, up to the fetch limit', async () => {
        const db = makeFakeAdminDb(() => ok([]))

        await selectLogs(asPublicClient(db.supabase), { since: SINCE })

        expect(db.calls).toHaveLength(1)
        expect(db.calls[0].table).toBe('logs')
        expect(db.calls[0].filters).toEqual([
            ['project', 'roxcoach'],
            ['created_at:gte', SINCE],
            ['order:created_at', true],
            ['order:created_at:desc', true],
            ['limit', LOGS_FETCH_LIMIT],
        ])
    })

    it('adds the search filter only when a search is given', async () => {
        const db = makeFakeAdminDb(() => ok([]))

        await selectLogs(asPublicClient(db.supabase), { since: SINCE, search: 'sync' })

        expect(db.calls[0].filters).toContainEqual([
            'or',
            'message.ilike."%sync%",prefix.ilike."%sync%"',
        ])
    })
})
