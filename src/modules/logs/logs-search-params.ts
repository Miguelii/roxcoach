import { createSearchParamsCache, parseAsString, parseAsStringLiteral } from 'nuqs/server'
import { DEFAULT_LOG_RANGE, LOG_RANGES } from '@/_bff/core/constants/logs.constants'

export const LOGS_SEARCH_PARAMS = {
    range: parseAsStringLiteral(LOG_RANGES).withDefault(DEFAULT_LOG_RANGE),
    search: parseAsString.withDefault(''),
}

export const logsSearchParamsCache = createSearchParamsCache(LOGS_SEARCH_PARAMS)
