// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { makeFakeAdminDb, ok } from '@/_bff/lib/fake-admin-db'
import { finishZeppSyncRun } from '@/_bff/modules/zepp/services/finish-zepp-sync.service'

const PAYLOAD = {
    userId: '6f1c2c1e-6a35-4f1b-9d0e-6a7a3c0f4b21',
    startedAt: '2026-11-23T10:00:00.000Z',
}
const NOW = new Date('2026-11-23T10:04:00.000Z')

describe('finishZeppSyncRun', () => {
    it('writes a failed outcome on the running lease of the payload', async () => {
        const db = makeFakeAdminDb(() => ok())

        await Effect.runPromise(
            finishZeppSyncRun(
                PAYLOAD,
                { status: 'failed', errorCode: ErrorCode.ZEPP_SYNC_FAILED },
                { createAdminClient: () => db.supabase, now: () => NOW }
            )
        )

        expect(db.calls).toEqual([
            {
                table: 'zepp_connections',
                op: 'update',
                payload: {
                    sync_status: 'failed',
                    sync_finished_at: NOW.toISOString(),
                    sync_result: null,
                    sync_error: ErrorCode.ZEPP_SYNC_FAILED,
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
