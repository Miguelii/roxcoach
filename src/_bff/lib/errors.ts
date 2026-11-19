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
export class StravaUnauthorizedError extends Data.TaggedError(
    'StravaUnauthorizedError'
)<ServiceErrorFields> {}
export class StravaNotFoundError extends Data.TaggedError(
    'StravaNotFoundError'
)<ServiceErrorFields> {}
export class StravaRateLimitedError extends Data.TaggedError('StravaRateLimitedError')<
    ServiceErrorFields & { retryAfterS: number | null }
> {}
export class StravaApiError extends Data.TaggedError('StravaApiError')<
    ServiceErrorFields & { status: number | null }
> {}
