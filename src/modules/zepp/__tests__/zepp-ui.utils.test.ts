import { describe, expect, it } from 'vitest'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { messageForZeppError, zeppSyncMessage } from '@/modules/zepp/zepp-ui.utils'

describe('messageForZeppError', () => {
    it('turns the error codes the server sends into actionable copy', () => {
        expect(messageForZeppError({ message: ErrorCode.ZEPP_LOGIN_REJECTED })).toBe(
            'Zepp did not accept this email or password.'
        )
        expect(messageForZeppError({ message: ErrorCode.ZEPP_SESSION_EXPIRED })).toBe(
            'Your Zepp session expired. Sign in again.'
        )
        expect(messageForZeppError({ message: ErrorCode.ZEPP_NO_CONNECTION })).toBe(
            'Connect Zepp before syncing.'
        )
    })

    it('falls back to a generic message for anything else and never echoes the raw message', () => {
        expect(messageForZeppError({ message: 'boom with secret' })).toBe(
            'Zepp could not complete the request. Try again.'
        )
    })
})

describe('zeppSyncMessage', () => {
    it('counts the imported runs, in the singular too', () => {
        expect(zeppSyncMessage({ imported: 2, skipped: 0, updated: 0, remaining: 0 })).toBe(
            'Imported 2 runs.'
        )
        expect(zeppSyncMessage({ imported: 1, skipped: 0, updated: 0, remaining: 0 })).toBe(
            'Imported 1 run.'
        )
    })

    it('adds the runs that were already there and the call to press Sync again', () => {
        expect(zeppSyncMessage({ imported: 2, skipped: 1, updated: 0, remaining: 3 })).toBe(
            'Imported 2 runs. 1 already in Roxcoach. More runs to sync. Press Sync again to continue.'
        )
    })

    it('counts the runs that got their splits, alone or after the imported ones', () => {
        expect(zeppSyncMessage({ imported: 0, skipped: 0, updated: 3, remaining: 0 })).toBe(
            'Added splits to 3 runs.'
        )
        expect(zeppSyncMessage({ imported: 1, skipped: 0, updated: 1, remaining: 0 })).toBe(
            'Imported 1 run. Added splits to 1 run.'
        )
    })

    it('says so when there is nothing new', () => {
        expect(zeppSyncMessage({ imported: 0, skipped: 0, updated: 0, remaining: 0 })).toBe(
            'No new runs.'
        )
    })
})
