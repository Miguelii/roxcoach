import { describe, expect, it } from 'vitest'
import { LYFTA_SYNC_IN_PROGRESS_MESSAGE } from '@/_bff/core/constants/lyfta.constants'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { messageForLyftaError } from '@/modules/lyfta/lyfta-ui.utils'

describe('messageForLyftaError', () => {
    it('turns the sync error codes into actionable copy', () => {
        expect(messageForLyftaError({ message: ErrorCode.LYFTA_SYNC_ENQUEUE })).toBe(
            'Could not start the Lyfta sync. Try again.'
        )
        expect(messageForLyftaError({ message: ErrorCode.LYFTA_SYNC_FAILED })).toBe(
            'The Lyfta sync stopped before finishing. Try again.'
        )
    })

    it('passes the in-progress message through and hides anything else', () => {
        expect(messageForLyftaError({ message: LYFTA_SYNC_IN_PROGRESS_MESSAGE })).toBe(
            LYFTA_SYNC_IN_PROGRESS_MESSAGE
        )
        expect(messageForLyftaError({ message: 'boom with secret' })).toBe(
            'Lyfta could not complete the request. Try again.'
        )
    })
})
