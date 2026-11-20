import { Match } from 'effect'
import {
    ActivityQueryError,
    ActivityWriteError,
    CreateSbClientError,
    LyftaApiError,
    LyftaApiRequestError,
    LyftaCheckpointError,
    LyftaConfigurationError,
    LyftaConnectionNotFoundError,
    LyftaConnectionParseError,
    LyftaConnectionQueryError,
    LyftaConnectionWriteError,
    LyftaCredentialError,
    LyftaImportError,
    LyftaRateLimitError,
    LyftaResponseError,
    ProfileQueryError,
} from '@/_bff/lib/errors'

type LyftaControllerError =
    | ActivityQueryError
    | ActivityWriteError
    | CreateSbClientError
    | LyftaApiError
    | LyftaApiRequestError
    | LyftaCheckpointError
    | LyftaConfigurationError
    | LyftaConnectionNotFoundError
    | LyftaConnectionParseError
    | LyftaConnectionQueryError
    | LyftaConnectionWriteError
    | LyftaCredentialError
    | LyftaImportError
    | LyftaRateLimitError
    | LyftaResponseError
    | ProfileQueryError

export const lyftaControllerErrorCode = (error: LyftaControllerError) =>
    Match.value(error).pipe(
        Match.tag('LyftaRateLimitError', () => 'TOO_MANY_REQUESTS' as const),
        Match.tag('LyftaCredentialError', () => 'BAD_REQUEST' as const),
        Match.tag('LyftaConnectionNotFoundError', () => 'PRECONDITION_FAILED' as const),
        Match.tag('LyftaApiError', () => 'BAD_GATEWAY' as const),
        Match.tag('LyftaApiRequestError', () => 'BAD_GATEWAY' as const),
        Match.tag('LyftaResponseError', () => 'BAD_GATEWAY' as const),
        Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
        Match.tag('ActivityQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
        Match.tag('ActivityWriteError', () => 'INTERNAL_SERVER_ERROR' as const),
        Match.tag('LyftaCheckpointError', () => 'INTERNAL_SERVER_ERROR' as const),
        Match.tag('LyftaConfigurationError', () => 'INTERNAL_SERVER_ERROR' as const),
        Match.tag('LyftaConnectionParseError', () => 'INTERNAL_SERVER_ERROR' as const),
        Match.tag('LyftaConnectionQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
        Match.tag('LyftaConnectionWriteError', () => 'INTERNAL_SERVER_ERROR' as const),
        Match.tag('LyftaImportError', () => 'INTERNAL_SERVER_ERROR' as const),
        Match.tag('ProfileQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
        Match.exhaustive
    )
