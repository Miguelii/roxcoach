const PERMANENT_ZEPP_SYNC_ERRORS = new Set([
    'ZeppConnectionNotFoundError',
    'ZeppConfigurationError',
    'ZeppCredentialError',
    'ZeppConnectionParseError',
    'ZeppSessionExpiredError',
])

// A permanent error fails the background run without a retry; any other error is retried.
export const isPermanentZeppSyncError = (error: { _tag: string }): boolean =>
    PERMANENT_ZEPP_SYNC_ERRORS.has(error._tag)
