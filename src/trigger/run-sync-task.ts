import { AbortTaskRunError } from '@trigger.dev/sdk'
import { Cause, Effect, Exit, Option } from 'effect'
import {
    type SyncOutcome,
    type SyncTaskPayload,
    syncTaskPayloadSchema,
} from '@/_bff/core/helpers/sync-state.helper'

type SyncTaskError = { _tag: string; error_hash: string }

type SyncTaskDependencies<A, E extends SyncTaskError> = {
    sync: (payload: SyncTaskPayload) => Effect.Effect<A, E>
    finish: (payload: SyncTaskPayload, outcome: SyncOutcome<A>) => Effect.Effect<void, unknown>
    isPermanent: (error: E) => boolean
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- parsed by syncTaskPayloadSchema right below
const parseSyncTaskPayload = (rawPayload: unknown): SyncTaskPayload => {
    const parsed = syncTaskPayloadSchema.safeParse(rawPayload)
    if (!parsed.success) throw new AbortTaskRunError('Invalid sync task payload')
    return parsed.data
}

const recordOutcome = async <A>(
    finish: SyncTaskDependencies<A, SyncTaskError>['finish'],
    payload: SyncTaskPayload,
    outcome: SyncOutcome<A>
): Promise<boolean> => Exit.isSuccess(await Effect.runPromiseExit(finish(payload, outcome)))

// Thrown messages carry only the error tag and code: the `cause` may hold upstream responses or
// secrets and Trigger.dev stores the message of every failed attempt.
export async function runSyncTask<A, E extends SyncTaskError>(
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- parsed by parseSyncTaskPayload
    rawPayload: unknown,
    dependencies: SyncTaskDependencies<A, E>
): Promise<A> {
    const payload = parseSyncTaskPayload(rawPayload)
    const exit = await Effect.runPromiseExit(dependencies.sync(payload))

    if (Exit.isSuccess(exit)) {
        const recorded = await recordOutcome(dependencies.finish, payload, {
            status: 'succeeded',
            result: exit.value,
        })
        if (!recorded) throw new Error('Could not record the sync outcome')
        return exit.value
    }

    const failure = Cause.findErrorOption(exit.cause)
    if (Option.isNone(failure)) throw Cause.squash(exit.cause)

    const error = failure.value
    if (dependencies.isPermanent(error)) {
        // A failed write here is retried by the task's onFailure hook.
        await recordOutcome(dependencies.finish, payload, {
            status: 'failed',
            errorCode: error.error_hash,
        })
        throw new AbortTaskRunError(error._tag)
    }

    throw new Error(`${error._tag} ${error.error_hash}`)
}

// The onFailure hook of a sync task: records the failure when the payload is valid. A failed write
// throws only its tag and code, for the same reason as runSyncTask.
export async function recordFailedSyncTask<A>(
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- parsed by syncTaskPayloadSchema right below
    rawPayload: unknown,
    finish: (
        payload: SyncTaskPayload,
        outcome: SyncOutcome<A>
    ) => Effect.Effect<void, SyncTaskError>,
    errorCode: string
): Promise<void> {
    const parsed = syncTaskPayloadSchema.safeParse(rawPayload)
    if (!parsed.success) return

    const exit = await Effect.runPromiseExit(finish(parsed.data, { status: 'failed', errorCode }))
    if (Exit.isSuccess(exit)) return

    const failure = Cause.findErrorOption(exit.cause)
    if (Option.isNone(failure)) throw new Error('Could not record the sync failure')
    throw new Error(`${failure.value._tag} ${failure.value.error_hash}`)
}
