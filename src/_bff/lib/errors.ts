import 'server-only'

import { Data } from 'effect'
import type { ErrorCode } from '@/_bff/lib/error-codes'

type ServiceErrorFields = { cause: unknown; error_hash: ErrorCode }

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

export class RaceQueryError extends Data.TaggedError('RaceQueryError')<ServiceErrorFields> {}
// `field` names the race field that failed validation.
export class RaceValidationError extends Data.TaggedError('RaceValidationError')<
    ServiceErrorFields & { field: string }
> {}
export class RaceNotFoundError extends Data.TaggedError('RaceNotFoundError')<ServiceErrorFields> {}
export class RaceStateError extends Data.TaggedError('RaceStateError')<ServiceErrorFields> {}

export class CoachQueryError extends Data.TaggedError('CoachQueryError')<ServiceErrorFields> {}
export class CoachWriteError extends Data.TaggedError('CoachWriteError')<ServiceErrorFields> {}
export class DailyCapReachedError extends Data.TaggedError(
    'DailyCapReachedError'
)<ServiceErrorFields> {}
export class ConversationNotFoundError extends Data.TaggedError(
    'ConversationNotFoundError'
)<ServiceErrorFields> {}

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
export class LyftaSyncEnqueueError extends Data.TaggedError(
    'LyftaSyncEnqueueError'
)<ServiceErrorFields> {}
export class LyftaImportError extends Data.TaggedError('LyftaImportError')<ServiceErrorFields> {}
export class LyftaCheckpointError extends Data.TaggedError(
    'LyftaCheckpointError'
)<ServiceErrorFields> {}

export class ZeppConfigurationError extends Data.TaggedError(
    'ZeppConfigurationError'
)<ServiceErrorFields> {}
export class ZeppCredentialError extends Data.TaggedError(
    'ZeppCredentialError'
)<ServiceErrorFields> {}
export class ZeppConnectionNotFoundError extends Data.TaggedError(
    'ZeppConnectionNotFoundError'
)<ServiceErrorFields> {}
export class ZeppConnectionQueryError extends Data.TaggedError(
    'ZeppConnectionQueryError'
)<ServiceErrorFields> {}
export class ZeppConnectionWriteError extends Data.TaggedError(
    'ZeppConnectionWriteError'
)<ServiceErrorFields> {}
export class ZeppConnectionParseError extends Data.TaggedError(
    'ZeppConnectionParseError'
)<ServiceErrorFields> {}
export class ZeppApiRequestError extends Data.TaggedError(
    'ZeppApiRequestError'
)<ServiceErrorFields> {}
export class ZeppApiResponseError extends Data.TaggedError(
    'ZeppApiResponseError'
)<ServiceErrorFields> {}
export class ZeppLoginRejectedError extends Data.TaggedError(
    'ZeppLoginRejectedError'
)<ServiceErrorFields> {}
export class ZeppSessionExpiredError extends Data.TaggedError(
    'ZeppSessionExpiredError'
)<ServiceErrorFields> {}
export class ZeppSyncInProgressError extends Data.TaggedError(
    'ZeppSyncInProgressError'
)<ServiceErrorFields> {}
export class ZeppSyncEnqueueError extends Data.TaggedError(
    'ZeppSyncEnqueueError'
)<ServiceErrorFields> {}
export class ZeppImportError extends Data.TaggedError('ZeppImportError')<ServiceErrorFields> {}
