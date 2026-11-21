import { parseAsStringLiteral } from 'nuqs/server'
import { DEFAULT_PROGRESS_RANGE, PROGRESS_RANGES } from '@/_bff/core/constants/progress.constants'

export const DASHBOARD_QUERY_STALE_TIME = 30_000

// The `range` URL parser, shared by the client hook and the server prefetch so both agree.
export const PROGRESS_RANGE_PARSER =
    parseAsStringLiteral(PROGRESS_RANGES).withDefault(DEFAULT_PROGRESS_RANGE)
