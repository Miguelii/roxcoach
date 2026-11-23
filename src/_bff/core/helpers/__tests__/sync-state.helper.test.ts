import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    LyftaSyncEnqueueError,
    ZeppSyncEnqueueError,
    ZeppSyncInProgressError,
} from '@/_bff/lib/errors'
import { SYNC_START_MESSAGE, SYNC_TASK_MAX_DURATION_S } from '@/_bff/core/constants/sync.constants'
import { ZEPP_SYNC_IN_PROGRESS_MESSAGE } from '@/_bff/core/constants/zepp.constants'
import {
    ownsSyncLease,
    syncIdempotencyKey,
    syncTaskPayloadSchema,
    toSyncState,
    type SyncOutcome,
    type SyncStateRow,
} from '@/_bff/core/helpers/sync-state.helper'

const schema = z.object({ imported: z.number() })
const NOW = new Date('2026-01-01T12:00:00.000Z')
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString()

const row = (over: Partial<SyncStateRow> = {}): SyncStateRow => ({
    sync_status: 'idle',
    sync_started_at: null,
    sync_finished_at: null,
    sync_result: null,
    sync_error: null,
    ...over,
})

describe('toSyncState', () => {
    it('returns idle for a missing row', () => {
        expect(toSyncState(null, schema, 'stale', NOW)).toEqual({
            status: 'idle',
            startedAt: null,
            finishedAt: null,
            result: null,
            errorCode: null,
        })
    })

    it('parses a succeeded result', () => {
        const state = toSyncState(
            row({ sync_status: 'succeeded', sync_result: { imported: 3 } }),
            schema,
            'stale',
            NOW
        )
        expect(state.status).toBe('succeeded')
        expect(state.result).toEqual({ imported: 3 })
    })

    it('keeps succeeded with a null result when the stored result is invalid', () => {
        const state = toSyncState(
            row({ sync_status: 'succeeded', sync_result: { nope: true } }),
            schema,
            'stale',
            NOW
        )
        expect(state.status).toBe('succeeded')
        expect(state.result).toBeNull()
    })

    it('keeps a fresh running sync running', () => {
        const state = toSyncState(
            row({ sync_status: 'running', sync_started_at: minutesAgo(19) }),
            schema,
            'stale',
            NOW
        )
        expect(state.status).toBe('running')
    })

    it('fails a stale running sync with the given error code', () => {
        const state = toSyncState(
            row({ sync_status: 'running', sync_started_at: minutesAgo(21) }),
            schema,
            'zepp019',
            NOW
        )
        expect(state.status).toBe('failed')
        expect(state.errorCode).toBe('zepp019')
    })

    it('returns the stored error of a failed sync', () => {
        const state = toSyncState(
            row({ sync_status: 'failed', sync_error: 'lyfta021' }),
            schema,
            'stale',
            NOW
        )
        expect(state.errorCode).toBe('lyfta021')
    })

    it('returns idle for an unknown status', () => {
        expect(toSyncState(row({ sync_status: 'weird' }), schema, 'stale', NOW).status).toBe('idle')
    })
})

describe('syncIdempotencyKey', () => {
    it('joins provider, user and start time', () => {
        expect(syncIdempotencyKey('zepp', { userId: 'u', startedAt: 't' })).toBe('zepp:u:t')
    })
})

describe('syncTaskPayloadSchema', () => {
    it('accepts a uuid and an ISO datetime', () => {
        const payload = {
            userId: '2f4a6c1e-8b3d-4e5f-9a7b-1c2d3e4f5a6b',
            startedAt: NOW.toISOString(),
        }
        expect(syncTaskPayloadSchema.parse(payload)).toEqual(payload)
    })

    it('rejects a non uuid user id', () => {
        expect(
            syncTaskPayloadSchema.safeParse({ userId: 'u', startedAt: NOW.toISOString() }).success
        ).toBe(false)
    })
})

describe('sync outcome and shared definitions', () => {
    it('models succeeded and failed outcomes', () => {
        const outcomes: SyncOutcome<number>[] = [
            { status: 'succeeded', result: 1 },
            { status: 'failed', errorCode: ErrorCode.LYFTA_SYNC_FAILED },
        ]
        expect(outcomes.map((outcome) => outcome.status)).toEqual(['succeeded', 'failed'])
    })

    it('exposes the sync constants and messages', () => {
        expect(SYNC_TASK_MAX_DURATION_S).toBe(900)
        expect(SYNC_START_MESSAGE).toBe('Syncing your activities. They will be available shortly.')
        expect(ZEPP_SYNC_IN_PROGRESS_MESSAGE).toBe('A Zepp sync is already running')
    })

    it('tags the new sync errors', () => {
        const fields = { cause: null, error_hash: ErrorCode.ZEPP_SYNC_ENQUEUE }
        expect(new LyftaSyncEnqueueError(fields)._tag).toBe('LyftaSyncEnqueueError')
        expect(new ZeppSyncInProgressError(fields)._tag).toBe('ZeppSyncInProgressError')
        expect(new ZeppSyncEnqueueError(fields)._tag).toBe('ZeppSyncEnqueueError')
    })
})

describe('ownsSyncLease', () => {
    const STARTED_AT = '2026-11-23T10:00:00.000Z'

    it('owns a running lease that started at the same instant, whatever the ISO format', () => {
        expect(
            ownsSyncLease(
                row({ sync_status: 'running', sync_started_at: '2026-11-23T10:00:00+00:00' }),
                STARTED_AT
            )
        ).toBe(true)
    })

    it('does not own a missing row, an idle row or a lease of another run', () => {
        expect(ownsSyncLease(null, STARTED_AT)).toBe(false)
        expect(ownsSyncLease(row({ sync_status: 'idle' }), STARTED_AT)).toBe(false)
        expect(
            ownsSyncLease(
                row({ sync_status: 'succeeded', sync_started_at: STARTED_AT }),
                STARTED_AT
            )
        ).toBe(false)
        expect(
            ownsSyncLease(
                row({ sync_status: 'running', sync_started_at: '2026-11-23T10:05:00.000Z' }),
                STARTED_AT
            )
        ).toBe(false)
        expect(
            ownsSyncLease(row({ sync_status: 'running', sync_started_at: 'garbage' }), 'garbage')
        ).toBe(false)
    })
})
