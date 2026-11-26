import { afterEach, describe, expect, it } from 'vitest'
import { DASHBOARD_MODE_COOKIE } from '@/modules/dashboard/constants'
import { modeFromCookie, rememberDashboardMode } from '@/modules/dashboard/utils'

describe('modeFromCookie', () => {
    it.each([
        ['strength', 'strength'],
        ['run', 'run'],
        [undefined, null],
        ['cycling', null],
    ] as const)('reads %s as %s', (value, mode) => {
        expect(modeFromCookie(value)).toBe(mode)
    })
})

describe('rememberDashboardMode', () => {
    afterEach(() => {
        document.cookie = `${DASHBOARD_MODE_COOKIE}=; path=/; max-age=0`
    })

    it('writes the mode cookie the server reads', () => {
        rememberDashboardMode('strength')

        expect(document.cookie).toContain(`${DASHBOARD_MODE_COOKIE}=strength`)
    })
})
