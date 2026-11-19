import 'server-only'

import { Cause, Effect, Exit, Option } from 'effect'
import type { ErrorCode } from '@/_bff/lib/error-codes'
import { StravaRateLimitedError } from '@/_bff/lib/errors'
import { RATE_LIMIT_RETRY_FLOOR_S } from '@/_bff/modules/strava/constants'

type ServiceFailure = { _tag: string; error_hash: ErrorCode }

type JobFailureFields = { tag: string; errorHash: string | null; retryAfterS: number | null }

type CatchErrorResult = { skipRetrying: true } | { retryAt: Date } | undefined

const UNEXPECTED = 'UnexpectedError'

// Deterministic failures: retrying cannot change the outcome. A 401 or 403 from Strava, a missing
// connection or credentials, a malformed payload and a 404 all fall here.
const NON_RETRYABLE_TAGS = new Set([
    'StravaUnauthorizedError',
    'StravaNotFoundError',
    'StravaNotConnectedError',
    'StravaNotConfiguredError',
    'StravaPayloadError',
])

// What a job throws to Trigger.dev. Only the error tag, its error hash and the rate limit delay
// survive: the original failure can carry a cause object (request data, tokens), and Trigger
// stores and logs whatever is thrown.
class StravaJobFailure extends Error {
    readonly tag: string
    readonly errorHash: string | null
    readonly retryAfterS: number | null

    constructor({ tag, errorHash, retryAfterS }: JobFailureFields) {
        super(errorHash === null ? tag : `${tag}:${errorHash}`)
        this.name = 'StravaJobFailure'
        this.tag = tag
        this.errorHash = errorHash
        this.retryAfterS = retryAfterS
    }
}

const toJobFailure = (failure: ServiceFailure) =>
    new StravaJobFailure({
        tag: failure._tag,
        errorHash: failure.error_hash,
        retryAfterS: failure instanceof StravaRateLimitedError ? failure.retryAfterS : null,
    })

// Runs a service effect as a Trigger.dev `run` body. A failure is rethrown (sanitized) so that
// Trigger retries according to `catchError`; a defect or interruption becomes a generic failure.
export const runStravaJob = async <Success>(effect: Effect.Effect<Success, ServiceFailure>) => {
    const exit = await Effect.runPromiseExit(effect)
    if (Exit.isSuccess(exit)) return exit.value

    const failure = Cause.findErrorOption(exit.cause)
    throw Option.isSome(failure)
        ? toJobFailure(failure.value)
        : new StravaJobFailure({ tag: UNEXPECTED, errorHash: null, retryAfterS: null })
}

// The `catchError` hook shared by every Strava job. A rate limit waits for Retry-After, and at
// least 15 minutes when Strava omits it (its limits are per 15-minute window). Trigger passes
// `retryDelayInMs` only while attempts remain: an explicit `retryAt` would bypass `maxAttempts`,
// so once they are exhausted the run is stopped instead, and `onFailure` runs. Everything else
// (5xx, network, unexpected) falls back to the job's exponential backoff.
export const stravaCatchError = ({
    error,
    retryDelayInMs,
}: {
    error: unknown
    retryDelayInMs?: number
}): CatchErrorResult => {
    if (!(error instanceof StravaJobFailure)) return undefined
    if (NON_RETRYABLE_TAGS.has(error.tag)) return { skipRetrying: true }
    if (error.tag === 'StravaRateLimitedError') {
        if (retryDelayInMs === undefined) return { skipRetrying: true }
        const delayS = error.retryAfterS ?? RATE_LIMIT_RETRY_FLOOR_S
        return { retryAt: new Date(Date.now() + delayS * 1000) }
    }
    return undefined
}

// The message stored on a failed webhook event: a fixed string made of the error tag and hash,
// never the error's own message or cause.
export const failureEventMessage = (cause: unknown) =>
    cause instanceof StravaJobFailure ? cause.message : UNEXPECTED
