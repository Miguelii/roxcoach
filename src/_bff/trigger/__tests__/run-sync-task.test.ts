// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { Effect, Predicate } from 'effect'
import { AbortTaskRunError } from '@trigger.dev/sdk'
import { LyftaApiError, LyftaResponseError } from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'
import type { SyncOutcome, SyncTaskPayload } from '@/_bff/core/helpers/sync-state.helper'
import type { LogProps } from '@/_bff/lib/log-writer'
import { recordFailedSyncTask, runSyncTask } from '@/_bff/trigger/run-sync-task'

type SyncError = LyftaApiError | LyftaResponseError
type Result = { created: number }
type FinishCall = { payload: SyncTaskPayload; outcome: SyncOutcome<Result> }

const PAYLOAD: SyncTaskPayload = {
    userId: '6f1c2c1e-6a35-4f1b-9d0e-6a7a3c0f4b21',
    startedAt: '2026-11-23T10:00:00.000Z',
}
const SECRET_CAUSE = 'upstream said: secret-token-123'

const collectingLog = (logs: LogProps[], rejects = false) =>
    vi.fn(async (props: LogProps) => {
        if (rejects) throw new Error('log store down')
        logs.push(props)
    })

const setup = (
    sync: (payload: SyncTaskPayload) => Effect.Effect<Result, SyncError>,
    logRejects = false
) => {
    const logs: LogProps[] = []
    const log = collectingLog(logs, logRejects)
    const finishCalls: FinishCall[] = []
    const syncSpy = vi.fn(sync)
    const finish = vi.fn((payload: SyncTaskPayload, outcome: SyncOutcome<Result>) => {
        finishCalls.push({ payload, outcome })
        return Effect.void
    })
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the payload under test may be invalid
    const run = (rawPayload: unknown) =>
        runSyncTask(rawPayload, {
            sync: syncSpy,
            finish,
            isPermanent: (error: SyncError) => Predicate.isTagged(error, 'LyftaResponseError'),
            prefix: 'lyftaSync',
            log,
        })
    return { run, finishCalls, syncSpy, finish, logs }
}

describe('runSyncTask', () => {
    it('records a succeeded outcome and returns the result', async () => {
        const { run, finishCalls, syncSpy } = setup(() => Effect.succeed({ created: 3 }))

        await expect(run(PAYLOAD)).resolves.toEqual({ created: 3 })

        expect(syncSpy).toHaveBeenCalledWith(PAYLOAD)
        expect(finishCalls).toEqual([
            { payload: PAYLOAD, outcome: { status: 'succeeded', result: { created: 3 } } },
        ])
    })

    it('records a failed outcome with the error code and aborts on a permanent error', async () => {
        const { run, finishCalls } = setup(() =>
            Effect.fail(
                new LyftaResponseError({
                    cause: SECRET_CAUSE,
                    error_hash: ErrorCode.LYFTA_API_RESPONSE,
                })
            )
        )

        const error = await run(PAYLOAD).catch((caught: Error) => caught)

        expect(error).toBeInstanceOf(AbortTaskRunError)
        expect(String(error)).not.toContain(SECRET_CAUSE)
        expect(finishCalls).toEqual([
            {
                payload: PAYLOAD,
                outcome: { status: 'failed', errorCode: ErrorCode.LYFTA_API_RESPONSE },
            },
        ])
    })

    it('throws a plain error without its cause and records nothing on a transient error', async () => {
        const { run, finish } = setup(() =>
            Effect.fail(
                new LyftaApiError({ cause: SECRET_CAUSE, error_hash: ErrorCode.LYFTA_API_REQUEST })
            )
        )

        const error = await run(PAYLOAD).catch((caught: Error) => caught)

        expect(error).toBeInstanceOf(Error)
        expect(error).not.toBeInstanceOf(AbortTaskRunError)
        expect(String(error)).toContain('LyftaApiError')
        expect(String(error)).not.toContain(SECRET_CAUSE)
        expect(finish).not.toHaveBeenCalled()
    })

    it('logs one error row with the real error before aborting on a permanent error', async () => {
        const failure = new LyftaResponseError({
            cause: SECRET_CAUSE,
            error_hash: ErrorCode.LYFTA_API_RESPONSE,
        })
        const { run, logs } = setup(() => Effect.fail(failure))

        await run(PAYLOAD).catch((caught: Error) => caught)

        expect(logs).toEqual([
            {
                level: 'error',
                prefix: 'lyftaSync',
                message: 'Sync failed',
                error: failure,
                userId: PAYLOAD.userId,
            },
        ])
    })

    it('logs one warn row for a failed attempt that will be retried', async () => {
        const failure = new LyftaApiError({
            cause: SECRET_CAUSE,
            error_hash: ErrorCode.LYFTA_API_REQUEST,
        })
        const { run, logs } = setup(() => Effect.fail(failure))

        await run(PAYLOAD).catch((caught: Error) => caught)

        expect(logs).toEqual([
            {
                level: 'warn',
                prefix: 'lyftaSync',
                message: 'Sync attempt failed, retrying',
                error: failure,
                userId: PAYLOAD.userId,
            },
        ])
    })

    it('logs nothing on success, the finish service logs the success', async () => {
        const { run, logs } = setup(() => Effect.succeed({ created: 1 }))

        await run(PAYLOAD)

        expect(logs).toEqual([])
    })

    it('keeps the thrown error when logging fails', async () => {
        const { run } = setup(
            () =>
                Effect.fail(
                    new LyftaResponseError({ cause: 'x', error_hash: ErrorCode.LYFTA_API_RESPONSE })
                ),
            true
        )

        await expect(run(PAYLOAD)).rejects.toBeInstanceOf(AbortTaskRunError)
    })

    it('aborts without syncing or recording when the payload has no userId', async () => {
        const { run, syncSpy, finish } = setup(() => Effect.succeed({ created: 0 }))

        await expect(run({ startedAt: PAYLOAD.startedAt })).rejects.toBeInstanceOf(
            AbortTaskRunError
        )

        expect(syncSpy).not.toHaveBeenCalled()
        expect(finish).not.toHaveBeenCalled()
    })

    it('rethrows a defect without recording an outcome', async () => {
        const defect = new Error('boom')
        const { run, finish } = setup(() => Effect.die(defect))

        await expect(run(PAYLOAD)).rejects.toBe(defect)

        expect(finish).not.toHaveBeenCalled()
    })
})

const recorder = (result: Effect.Effect<void, SyncError>) => {
    const calls: FinishCall[] = []
    const finish = vi.fn((payload: SyncTaskPayload, outcome: SyncOutcome<Result>) => {
        calls.push({ payload, outcome })
        return result
    })
    return { calls, finish }
}

const logging = (logs: LogProps[] = [], rejects = false) => ({
    prefix: 'lyftaSync' as const,
    log: collectingLog(logs, rejects),
})

describe('recordFailedSyncTask', () => {
    it('logs one error row when the run failed for good', async () => {
        const { finish } = recorder(Effect.void)
        const logs: LogProps[] = []

        await recordFailedSyncTask(PAYLOAD, finish, ErrorCode.LYFTA_SYNC_FAILED, logging(logs))

        expect(logs).toEqual([
            {
                level: 'error',
                prefix: 'lyftaSync',
                message: 'Sync failed after all attempts',
                metadata: { errorCode: ErrorCode.LYFTA_SYNC_FAILED },
                userId: PAYLOAD.userId,
            },
        ])
    })

    it('still records the outcome when logging fails', async () => {
        const { calls, finish } = recorder(Effect.void)

        await recordFailedSyncTask(PAYLOAD, finish, ErrorCode.LYFTA_SYNC_FAILED, logging([], true))

        expect(calls).toHaveLength(1)
    })

    it('records a failed outcome with the given error code', async () => {
        const { calls, finish } = recorder(Effect.void)

        await recordFailedSyncTask(PAYLOAD, finish, ErrorCode.LYFTA_SYNC_FAILED, logging())

        expect(calls).toEqual([
            {
                payload: PAYLOAD,
                outcome: { status: 'failed', errorCode: ErrorCode.LYFTA_SYNC_FAILED },
            },
        ])
    })

    it('returns without recording when the payload is invalid', async () => {
        const { finish } = recorder(Effect.void)

        await expect(
            recordFailedSyncTask({ userId: 'nope' }, finish, ErrorCode.LYFTA_SYNC_FAILED, logging())
        ).resolves.toBeUndefined()

        expect(finish).not.toHaveBeenCalled()
    })

    it('throws only the tag and code when the outcome cannot be recorded', async () => {
        const { finish } = recorder(
            Effect.fail(
                new LyftaApiError({ cause: SECRET_CAUSE, error_hash: ErrorCode.LYFTA_API_REQUEST })
            )
        )

        const error = await recordFailedSyncTask(
            PAYLOAD,
            finish,
            ErrorCode.LYFTA_SYNC_FAILED,
            logging()
        ).catch((caught: Error) => caught)

        expect(error).toBeInstanceOf(Error)
        expect(String(error)).toContain(`LyftaApiError ${ErrorCode.LYFTA_API_REQUEST}`)
        expect(String(error)).not.toContain(SECRET_CAUSE)
        expect(error).not.toHaveProperty('cause')
    })
})
