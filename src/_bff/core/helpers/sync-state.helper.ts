import { z } from 'zod'
import {
    SYNC_LEASE_STALE_MS,
    SYNC_STATUSES,
    type SyncStatus,
} from '@/_bff/core/constants/sync.constants'

export type SyncStateRow = {
    sync_status: string
    sync_started_at: string | null
    sync_finished_at: string | null
    sync_result: unknown
    sync_error: string | null
}

export type SyncState<R> = {
    status: SyncStatus
    startedAt: string | null
    finishedAt: string | null
    result: R | null
    errorCode: string | null
}

export type SyncOutcome<R> =
    | { status: 'succeeded'; result: R }
    | { status: 'failed'; errorCode: string }

export const syncTaskPayloadSchema = z.object({
    userId: z.uuid(),
    startedAt: z.iso.datetime(),
})

export type SyncTaskPayload = z.infer<typeof syncTaskPayloadSchema>

const toSyncStatus = (value: string): SyncStatus | null =>
    SYNC_STATUSES.find((status) => status === value) ?? null

export function toSyncState<R>(
    row: SyncStateRow | null,
    resultSchema: z.ZodType<R>,
    staleErrorCode: string,
    now: Date
): SyncState<R> {
    const status = row ? toSyncStatus(row.sync_status) : null
    if (!row || !status) {
        return { status: 'idle', startedAt: null, finishedAt: null, result: null, errorCode: null }
    }
    const base = { startedAt: row.sync_started_at, finishedAt: row.sync_finished_at }

    if (status === 'running') {
        const startedMs = row.sync_started_at ? Date.parse(row.sync_started_at) : Number.NaN
        const stale = Number.isNaN(startedMs) || now.getTime() - startedMs > SYNC_LEASE_STALE_MS
        return stale
            ? { ...base, status: 'failed', result: null, errorCode: staleErrorCode }
            : { ...base, status: 'running', result: null, errorCode: null }
    }

    const parsed = resultSchema.safeParse(row.sync_result)
    return {
        ...base,
        status,
        result: parsed.success ? parsed.data : null,
        errorCode: row.sync_error,
    }
}

export function syncIdempotencyKey(provider: 'lyfta' | 'zepp', payload: SyncTaskPayload): string {
    return `${provider}:${payload.userId}:${payload.startedAt}`
}
