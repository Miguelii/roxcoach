import { createLoader, parseAsStringLiteral } from 'nuqs/server'
import type { DashboardMode } from '@/_bff/core/constants/athlete.constants'
import { DEFAULT_PROGRESS_RANGE, PROGRESS_RANGES } from '@/_bff/core/constants/progress.constants'

export const DASHBOARD_QUERY_STALE_TIME = 30_000

// The `range` URL parser, shared by the client hook and the server prefetch so both agree.
export const PROGRESS_RANGE_PARSER =
    parseAsStringLiteral(PROGRESS_RANGES).withDefault(DEFAULT_PROGRESS_RANGE)

// Reads the dashboard search params on the server with the same parser as the hook.
export const loadProgressSearchParams = createLoader({ range: PROGRESS_RANGE_PARSER })

// The layout drawn while the profile loads when no mode is remembered yet: the column default.
export const LOADING_DASHBOARD_MODE: DashboardMode = 'run'

// The last known dashboard mode, so the server can draw the loading layout of the right mode
// before the profile arrives. A cookie (not localStorage) so the server render reads it. It only
// picks a loading layout: the profile stays the source of truth.
export const DASHBOARD_MODE_COOKIE = 'dashboard_mode'
export const DASHBOARD_MODE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
