import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { createCaller } from '@/_bff/trpc/caller'
import { LogsExplorer } from '@/modules/logs/logs-explorer'
import { logsSearchParamsCache } from '@/modules/logs/logs-search-params'
import { LogsSkeleton } from '@/modules/logs/logs-skeleton'
import { MAX_SEARCH_LENGTH } from '@/modules/logs/logs-ui.constants'

type Props = PageProps<'/logs'>

type LogsContentProps = Pick<Props, 'searchParams'>

export const metadata: Metadata = { title: 'Logs' }

export default function LogsPage({ searchParams }: Props) {
    return (
        <main className="main-container-lg">
            <div className="space-y-6">
                <h1 className="type-title">Logs</h1>
                <Suspense fallback={<LogsSkeleton />}>
                    <LogsContent searchParams={searchParams} />
                </Suspense>
            </div>
        </main>
    )
}

async function LogsContent({ searchParams }: LogsContentProps) {
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
        <LogsExplorer logs={logs} isTruncated={isTruncated} range={range} fetchedAt={fetchedAt} />
    )
}
