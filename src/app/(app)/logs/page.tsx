import type { Metadata } from 'next'
import { connection } from 'next/server'
import { createCaller } from '@/_bff/trpc/caller'
import { LogsExplorer } from '@/modules/logs/logs-explorer'
import { MAX_SEARCH_LENGTH } from '@/modules/logs/logs-ui.constants'
import { logsSearchParamsCache } from '@/modules/logs/logs-search-params'

type Props = PageProps<'/logs'>

export const metadata: Metadata = { title: 'Logs' }

export default async function LogsPage({ searchParams }: Props) {
    // The logs are fresh by definition and the fetch time anchors the histogram window.
    await connection()
    const [caller, { range, search }] = await Promise.all([
        createCaller(),
        logsSearchParamsCache.parse(searchParams),
    ])
    const fetchedAt = new Date().toISOString()
    const { logs, isTruncated } = await caller.logs.getAll({
        range,
        search: search.slice(0, MAX_SEARCH_LENGTH) || undefined,
    })

    return (
        <main className="main-container-lg">
            <div className="space-y-6">
                <h1 className="type-title">Logs</h1>
                <LogsExplorer
                    logs={logs}
                    isTruncated={isTruncated}
                    range={range}
                    fetchedAt={fetchedAt}
                />
            </div>
        </main>
    )
}
