// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { makeFakeAdminDb, ok } from '@/_bff/lib/fake-admin-db'
import { finishLyftaSyncRun } from '@/_bff/modules/lyfta/services/finish-lyfta-sync.service'

const PAYLOAD = {
    userId: '6f1c2c1e-6a35-4f1b-9d0e-6a7a3c0f4b21',
    startedAt: '2026-11-23T10:00:00.000Z',
}
const NOW = new Date('2026-11-23T10:04:00.000Z')
const SYNC_SUMMARY = {
    created: 2,
    updated: 1,
    hasMore: false,
    lastSyncedAt: '2026-11-22T00:00:00.000Z',
}

describe('finishLyftaSyncRun', () => {
    it('writes only the result fields on the running lease of the payload', async () => {
        const db = makeFakeAdminDb(() => ok())

        await Effect.runPromise(
            finishLyftaSyncRun(
                PAYLOAD,
                { status: 'succeeded', result: SYNC_SUMMARY },
                { createAdminClient: () => db.supabase, now: () => NOW }
            )
        )

        expect(db.calls).toEqual([
            {
                table: 'lyfta_connections',
                op: 'update',
                payload: {
                    sync_status: 'succeeded',
                    sync_finished_at: NOW.toISOString(),
                    sync_result: { created: 2, updated: 1, hasMore: false },
                    sync_error: null,
                },
                options: undefined,
                filters: [
                    ['user_id', PAYLOAD.userId],
                    ['sync_started_at', PAYLOAD.startedAt],
                    ['sync_status', 'running'],
                ],
            },
        ])
    })
})
