import 'server-only'

import { Data } from 'effect'
import type { ErrorCode } from '@/_bff/lib/error-codes'

type ServiceErrorFields = { cause: unknown; error_hash: ErrorCode }

// Auth
export class CreateSbClientError extends Data.TaggedError(
    'CreateSbClientError'
)<ServiceErrorFields> {}
export class GetUserError extends Data.TaggedError('GetUserError')<ServiceErrorFields> {}
export class SignInWithPasswordError extends Data.TaggedError(
    'SignInWithPasswordError'
)<ServiceErrorFields> {}
export class AccessDeniedError extends Data.TaggedError('AccessDeniedError')<ServiceErrorFields> {}
export class LogoutError extends Data.TaggedError('LogoutError')<ServiceErrorFields> {}

// Strava
// `status` is the HTTP status (401 or 403): a caller that must tell them apart reads it.
export class StravaUnauthorizedError extends Data.TaggedError('StravaUnauthorizedError')<
    ServiceErrorFields & { status: number }
> {}
export class StravaNotFoundError extends Data.TaggedError(
    'StravaNotFoundError'
)<ServiceErrorFields> {}
export class StravaRateLimitedError extends Data.TaggedError('StravaRateLimitedError')<
    ServiceErrorFields & { retryAfterS: number | null }
> {}
export class StravaApiError extends Data.TaggedError('StravaApiError')<
    ServiceErrorFields & { status: number | null }
> {}
export class StravaNotConfiguredError extends Data.TaggedError(
    'StravaNotConfiguredError'
)<ServiceErrorFields> {}
export class StravaNotConnectedError extends Data.TaggedError(
    'StravaNotConnectedError'
)<ServiceErrorFields> {}
export class StravaConnectionError extends Data.TaggedError(
    'StravaConnectionError'
)<ServiceErrorFields> {}
export class StravaPayloadError extends Data.TaggedError(
    'StravaPayloadError'
)<ServiceErrorFields> {}
export class WebhookEventError extends Data.TaggedError('WebhookEventError')<ServiceErrorFields> {}
export class EnqueueStravaJobError extends Data.TaggedError(
    'EnqueueStravaJobError'
)<ServiceErrorFields> {}

// Athlete
export class ProfileQueryError extends Data.TaggedError('ProfileQueryError')<ServiceErrorFields> {}

// Training
export class ActivityQueryError extends Data.TaggedError(
    'ActivityQueryError'
)<ServiceErrorFields> {}
export class ActivityWriteError extends Data.TaggedError(
    'ActivityWriteError'
)<ServiceErrorFields> {}
export class InvalidDateRangeError extends Data.TaggedError(
    'InvalidDateRangeError'
)<ServiceErrorFields> {}
