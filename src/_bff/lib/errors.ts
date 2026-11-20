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

// Athlete
export class ProfileQueryError extends Data.TaggedError('ProfileQueryError')<ServiceErrorFields> {}

// Training
export class ActivityQueryError extends Data.TaggedError(
    'ActivityQueryError'
)<ServiceErrorFields> {}
export class ActivityWriteError extends Data.TaggedError(
    'ActivityWriteError'
)<ServiceErrorFields> {}
export class UnsupportedActivityFileError extends Data.TaggedError(
    'UnsupportedActivityFileError'
)<ServiceErrorFields> {}
export class ActivityFileParseError extends Data.TaggedError(
    'ActivityFileParseError'
)<ServiceErrorFields> {}
export class DuplicateActivityFileError extends Data.TaggedError(
    'DuplicateActivityFileError'
)<ServiceErrorFields> {}
export class ActivityFileTooLargeError extends Data.TaggedError(
    'ActivityFileTooLargeError'
)<ServiceErrorFields> {}
export class ActivityFileStorageError extends Data.TaggedError(
    'ActivityFileStorageError'
)<ServiceErrorFields> {}
export class InvalidDateRangeError extends Data.TaggedError(
    'InvalidDateRangeError'
)<ServiceErrorFields> {}
