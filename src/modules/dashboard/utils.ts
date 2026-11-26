import { DASHBOARD_MODES, type DashboardMode } from '@/_bff/core/constants/athlete.constants'
import { addDays } from '@/_bff/core/utils/week-dates.utils'
import { DASHBOARD_MODE_COOKIE, DASHBOARD_MODE_COOKIE_MAX_AGE } from '@/modules/dashboard/constants'

// The calendar window behind the week strip and the run progress (the last five weeks). The
// server prefetch uses it too, so every caller builds the same query key.
export const weekStripWindow = (today: string) => ({ from: addDays(today, -34), to: today })

// The mode remembered in the cookie, or null when it is missing or not a mode (tampered, stale).
export const modeFromCookie = (value: string | undefined): DashboardMode | null =>
    DASHBOARD_MODES.find((mode) => mode === value) ?? null

export const rememberDashboardMode = (mode: DashboardMode) => {
    document.cookie = `${DASHBOARD_MODE_COOKIE}=${mode}; path=/; max-age=${DASHBOARD_MODE_COOKIE_MAX_AGE}; samesite=lax`
}
