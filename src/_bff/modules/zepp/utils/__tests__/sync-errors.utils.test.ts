// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isPermanentZeppSyncError } from '@/_bff/modules/zepp/utils/sync-errors.utils'

const PERMANENT = [
    'ZeppConnectionNotFoundError',
    'ZeppConfigurationError',
    'ZeppCredentialError',
    'ZeppConnectionParseError',
    'ZeppSessionExpiredError',
]

const TRANSIENT = [
    'ZeppApiRequestError',
    'ZeppApiResponseError',
    'ZeppConnectionQueryError',
    'ZeppConnectionWriteError',
    'ActivityWriteError',
]

describe('isPermanentZeppSyncError', () => {
    it.each(PERMANENT)('treats %s as permanent', (tag) => {
        expect(isPermanentZeppSyncError({ _tag: tag })).toBe(true)
    })

    it.each(TRANSIENT)('treats %s as transient so the run is retried', (tag) => {
        expect(isPermanentZeppSyncError({ _tag: tag })).toBe(false)
    })
})
