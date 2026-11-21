import Link from 'next/link'
import { IconChevronRight } from '@tabler/icons-react'
import { formatDuration, formatPace } from '@/_bff/core/utils/formatters.utils'
import type { CalendarItem } from '@/_bff/modules/training/types'
import { dayLabel } from '@/modules/dashboard/progress/progress-utils'

type Props = {
    items: CalendarItem[]
}

const SHOWN = 5

// The latest runs as a feed, newest first, each linking to its page.
export function RecentRuns({ items }: Props) {
    const runs = items
        .flatMap((item) =>
            item.type === 'activity' && item.activity.category === 'run' ? [item.activity] : []
        )
        .toSorted((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, SHOWN)

    if (runs.length === 0) return null

    return (
        <section
            data-testid="recent-runs"
            aria-label="Recent runs"
            className="space-y-1 rounded-[var(--radius-surface)] border border-ink/10 bg-card p-4"
        >
            <h2 className="display pb-2 text-lg">Recent runs</h2>
            <ul className="divide-y divide-hairline">
                {runs.map((run) => (
                    <li key={run.id}>
                        <Link
                            href={`/activities/${run.id}`}
                            data-testid={`recent-run-${run.id}`}
                            className="flex min-h-14 items-center gap-3 py-2.5 transition-colors hover:bg-muted/50"
                        >
                            <div className="min-w-0 flex-1 space-y-0.5">
                                <p className="truncate text-sm font-medium">{run.name}</p>
                                <p className="text-xs text-muted-foreground">
                                    {dayLabel(run.localDate)}
                                    {formatDuration(run.movingTimeS) === null
                                        ? ''
                                        : `, ${formatDuration(run.movingTimeS)}`}
                                </p>
                            </div>
                            <div className="shrink-0 text-right tabular-nums">
                                <p className="display text-xl">
                                    {((run.distanceM ?? 0) / 1000).toFixed(1)}
                                    <span className="text-xs text-muted-foreground"> km</span>
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {formatPace(run.avgSpeedMps) ?? '-'}
                                </p>
                            </div>
                            <IconChevronRight
                                className="size-4 shrink-0 text-muted-foreground"
                                aria-hidden="true"
                            />
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    )
}
