'use client'

import type { LogEntry, LogRange } from '@/_bff/core/constants/logs.constants'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DetailDrawer } from '@/components/ui/detail-drawer'
import { LogDetails } from '@/modules/logs/log-details'
import { LogsFilters } from '@/modules/logs/logs-filters'
import { LogsHistogram } from '@/modules/logs/logs-histogram'
import { LogsTable } from '@/modules/logs/logs-table'
import { LogsToolbar } from '@/modules/logs/logs-toolbar'
import { useLogsExplorer } from '@/modules/logs/use-logs-explorer'

type Props = {
    logs: LogEntry[]
    isTruncated: boolean
    range: LogRange
    fetchedAt: string
}

type EmptyStateProps = {
    hasLogs: boolean
    onClear: () => void
}

function EmptyState({ hasLogs, onClear }: EmptyStateProps) {
    return (
        <div
            data-testid="logs-empty"
            className="flex flex-col items-center gap-2 px-4 py-16 text-center"
        >
            <p className="text-sm font-medium">
                {hasLogs ? 'No logs match these filters' : 'No logs in this time range'}
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
                {hasLogs
                    ? 'Change or clear the level and source filters.'
                    : 'Try a wider range. Logs are only saved in production.'}
            </p>
            {hasLogs ? (
                <Button
                    variant="outline"
                    size="sm"
                    data-testid="logs-empty-clear"
                    onClick={onClear}
                    className="mt-2"
                >
                    Clear filters
                </Button>
            ) : null}
        </div>
    )
}

export function LogsExplorer({ logs, isTruncated, range, fetchedAt }: Props) {
    const explorer = useLogsExplorer({ logs, range, fetchedAt })
    const { selectedLog } = explorer

    return (
        <div data-testid="logs-explorer" className="space-y-4">
            <LogsToolbar />
            {isTruncated ? (
                <p
                    data-testid="logs-truncated"
                    className="rounded-[var(--radius-surface-inner)] bg-amber-soft px-4 py-3 text-sm text-amber-deep"
                >
                    Showing the most recent 1000 logs of this range. Narrow the range or search to
                    see older ones.
                </p>
            ) : null}
            <Card className="p-4">
                <LogsHistogram buckets={explorer.histogram} range={range} />
            </Card>
            <LogsFilters
                levels={explorer.levels}
                sources={explorer.sources}
                levelFacets={explorer.levelFacets}
                sourceFacets={explorer.sourceFacets}
                hasFilters={explorer.hasFilters}
                onToggleLevel={explorer.toggleLevel}
                onToggleSource={explorer.toggleSource}
                onClear={explorer.clearFilters}
            />
            <Card className="py-0">
                {explorer.filteredLogs.length === 0 ? (
                    <EmptyState hasLogs={logs.length > 0} onClear={explorer.clearFilters} />
                ) : (
                    <LogsTable
                        logs={explorer.filteredLogs}
                        range={range}
                        onSelect={explorer.selectLog}
                    />
                )}
            </Card>
            <DetailDrawer
                open={selectedLog !== null}
                onOpenChange={(open) => {
                    if (!open) explorer.closeDetails()
                }}
                title="Log details"
                description={selectedLog?.prefix ?? ''}
                testId="logs-details"
            >
                {selectedLog ? <LogDetails log={selectedLog} /> : null}
            </DetailDrawer>
        </div>
    )
}
