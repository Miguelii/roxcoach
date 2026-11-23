const PERMANENT_LYFTA_SYNC_ERRORS = new Set([
    'LyftaConnectionNotFoundError',
    'LyftaConfigurationError',
    'LyftaCredentialError',
    'LyftaConnectionParseError',
    'LyftaResponseError',
    'LyftaCheckpointError',
])

// A permanent error fails the background run without a retry; any other error is retried.
export const isPermanentLyftaSyncError = (error: { _tag: string }): boolean =>
    PERMANENT_LYFTA_SYNC_ERRORS.has(error._tag)
