// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isPermanentLyftaSyncError } from '@/_bff/modules/lyfta/utils/sync-errors.utils'

const PERMANENT = [
    'LyftaConnectionNotFoundError',
    'LyftaConfigurationError',
    'LyftaCredentialError',
    'LyftaConnectionParseError',
    'LyftaResponseError',
    'LyftaCheckpointError',
]

const TRANSIENT = [
    'LyftaApiRequestError',
    'LyftaRateLimitError',
    'LyftaApiError',
    'LyftaConnectionWriteError',
    'ActivityWriteError',
]

describe('isPermanentLyftaSyncError', () => {
    it.each(PERMANENT)('treats %s as permanent', (tag) => {
        expect(isPermanentLyftaSyncError({ _tag: tag })).toBe(true)
    })

    it.each(TRANSIENT)('treats %s as transient so the run is retried', (tag) => {
        expect(isPermanentLyftaSyncError({ _tag: tag })).toBe(false)
    })
})
