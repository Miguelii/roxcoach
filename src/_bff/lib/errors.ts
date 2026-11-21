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
export class SignUpClosedError extends Data.TaggedError('SignUpClosedError')<ServiceErrorFields> {}
export class InvalidAccessCodeError extends Data.TaggedError(
    'InvalidAccessCodeError'
)<ServiceErrorFields> {}
export class CreateUserError extends Data.TaggedError('CreateUserError')<ServiceErrorFields> {}
export class GrantAccessError extends Data.TaggedError('GrantAccessError')<ServiceErrorFields> {}

// Athlete
export class AccountDeletionError extends Data.TaggedError(
    'AccountDeletionError'
)<ServiceErrorFields> {}
export class ProfileQueryError extends Data.TaggedError('ProfileQueryError')<ServiceErrorFields> {}
// `field` names the profile field that failed validation.
export class ProfileValidationError extends Data.TaggedError('ProfileValidationError')<
    ServiceErrorFields & { field: string }
> {}
export class AvailabilityQueryError extends Data.TaggedError(
    'AvailabilityQueryError'
)<ServiceErrorFields> {}
// `reason` is a stable code for the rule that failed (never free text).
export class AvailabilityValidationError extends Data.TaggedError('AvailabilityValidationError')<
    ServiceErrorFields & { reason: string }
> {}

// Races
export class RaceQueryError extends Data.TaggedError('RaceQueryError')<ServiceErrorFields> {}
// `field` names the race field that failed validation.
export class RaceValidationError extends Data.TaggedError('RaceValidationError')<
    ServiceErrorFields & { field: string }
> {}
export class RaceNotFoundError extends Data.TaggedError('RaceNotFoundError')<ServiceErrorFields> {}
export class RaceStateError extends Data.TaggedError('RaceStateError')<ServiceErrorFields> {}

// Coach
export class CoachQueryError extends Data.TaggedError('CoachQueryError')<ServiceErrorFields> {}
export class CoachWriteError extends Data.TaggedError('CoachWriteError')<ServiceErrorFields> {}
export class DailyCapReachedError extends Data.TaggedError(
    'DailyCapReachedError'
)<ServiceErrorFields> {}
export class ConversationNotFoundError extends Data.TaggedError(
    'ConversationNotFoundError'
)<ServiceErrorFields> {}

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

// Lyfta
export class LyftaConfigurationError extends Data.TaggedError(
    'LyftaConfigurationError'
)<ServiceErrorFields> {}
export class LyftaCredentialError extends Data.TaggedError(
    'LyftaCredentialError'
)<ServiceErrorFields> {}
export class LyftaConnectionNotFoundError extends Data.TaggedError(
    'LyftaConnectionNotFoundError'
)<ServiceErrorFields> {}
export class LyftaConnectionQueryError extends Data.TaggedError(
    'LyftaConnectionQueryError'
)<ServiceErrorFields> {}
export class LyftaConnectionWriteError extends Data.TaggedError(
    'LyftaConnectionWriteError'
)<ServiceErrorFields> {}
export class LyftaConnectionParseError extends Data.TaggedError(
    'LyftaConnectionParseError'
)<ServiceErrorFields> {}
export class LyftaApiRequestError extends Data.TaggedError(
    'LyftaApiRequestError'
)<ServiceErrorFields> {}
export class LyftaRateLimitError extends Data.TaggedError(
    'LyftaRateLimitError'
)<ServiceErrorFields> {}
export class LyftaApiError extends Data.TaggedError('LyftaApiError')<ServiceErrorFields> {}
export class LyftaResponseError extends Data.TaggedError(
    'LyftaResponseError'
)<ServiceErrorFields> {}
export class LyftaSyncInProgressError extends Data.TaggedError(
    'LyftaSyncInProgressError'
)<ServiceErrorFields> {}
export class LyftaImportError extends Data.TaggedError('LyftaImportError')<ServiceErrorFields> {}
export class LyftaCheckpointError extends Data.TaggedError(
    'LyftaCheckpointError'
)<ServiceErrorFields> {}
