import 'server-only'

import type { createDBPublicAdminClient } from '@/_bff/core/db'
import { LOGS_FETCH_LIMIT } from '@/_bff/core/constants/logs.constants'
import { buildLogSearchFilter } from '@/_bff/modules/logs/helpers/log-search-filter.helper'
import { PublicDbTables } from '@/_bff/core/db/tables'

type PublicAdminClient = ReturnType<typeof createDBPublicAdminClient>

const PROJECT = 'roxcoach'

// Deliberately not filtered by user: the page is admin-only (adminProcedure) and reads every
// Roxcoach row (see database.md). Never cached: logs are written on every request and must be fresh.
export function selectLogs(
    supabase: PublicAdminClient,
    { since, search }: { since: string; search?: string }
) {
    const query = supabase
        .from(PublicDbTables.LOGS)
        .select('*')
        .eq('project', PROJECT)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(LOGS_FETCH_LIMIT)

    return search ? query.or(buildLogSearchFilter(search)) : query
}
