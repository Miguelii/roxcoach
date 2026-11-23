import { Match } from 'effect'
import { ZEPP_SYNC_IN_PROGRESS_MESSAGE } from '@/_bff/core/constants/zepp.constants'
import {
    ActivityQueryError,
    ActivityWriteError,
    CreateSbClientError,
    ProfileQueryError,
    ZeppApiRequestError,
    ZeppApiResponseError,
    ZeppConfigurationError,
    ZeppConnectionNotFoundError,
    ZeppConnectionParseError,
    ZeppConnectionQueryError,
    ZeppConnectionWriteError,
    ZeppCredentialError,
    ZeppImportError,
    ZeppLoginRejectedError,
    ZeppSessionExpiredError,
    ZeppSyncEnqueueError,
    ZeppSyncInProgressError,
} from '@/_bff/lib/errors'

type ZeppControllerError =
    | ActivityQueryError
    | ActivityWriteError
    | CreateSbClientError
    | ProfileQueryError
    | ZeppApiRequestError
    | ZeppApiResponseError
    | ZeppConfigurationError
    | ZeppConnectionNotFoundError
    | ZeppConnectionParseError
    | ZeppConnectionQueryError
    | ZeppConnectionWriteError
    | ZeppCredentialError
    | ZeppImportError
    | ZeppLoginRejectedError
    | ZeppSessionExpiredError
    | ZeppSyncEnqueueError
    | ZeppSyncInProgressError

// The message the client receives: the error hash, except for the refused overlapping sync, whose
// fixed text the UI shows as is.
export const zeppControllerMessage = (error: ZeppControllerError): string =>
    Match.value(error).pipe(
        Match.tag('ZeppSyncInProgressError', () => ZEPP_SYNC_IN_PROGRESS_MESSAGE),
        Match.orElse((other) => other.error_hash)
    )

// UNAUTHORIZED is never used here: the client treats it as a lost app session.
export const zeppControllerErrorCode = (error: ZeppControllerError) =>
    Match.value(error).pipe(
        Match.tag('ZeppLoginRejectedError', () => 'BAD_REQUEST' as const),
        Match.tag('ZeppSessionExpiredError', () => 'PRECONDITION_FAILED' as const),
        Match.tag('ZeppConnectionNotFoundError', () => 'PRECONDITION_FAILED' as const),
        Match.tag('ZeppSyncInProgressError', () => 'CONFLICT' as const),
        Match.tag('ZeppApiRequestError', () => 'BAD_GATEWAY' as const),
        Match.tag('ZeppApiResponseError', () => 'BAD_GATEWAY' as const),
        Match.tag('ZeppCredentialError', () => 'INTERNAL_SERVER_ERROR' as const),
        Match.tag('ZeppConfigurationError', () => 'INTERNAL_SERVER_ERROR' as const),
        Match.tag('ZeppConnectionParseError', () => 'INTERNAL_SERVER_ERROR' as const),
        Match.tag('ZeppConnectionQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
        Match.tag('ZeppConnectionWriteError', () => 'INTERNAL_SERVER_ERROR' as const),
        Match.tag('ZeppSyncEnqueueError', () => 'INTERNAL_SERVER_ERROR' as const),
        Match.tag('ZeppImportError', () => 'INTERNAL_SERVER_ERROR' as const),
        Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
        Match.tag('ActivityQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
        Match.tag('ActivityWriteError', () => 'INTERNAL_SERVER_ERROR' as const),
        Match.tag('ProfileQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
        Match.exhaustive
    )
