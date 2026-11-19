import { IconBrain } from '@tabler/icons-react'
import { shortDateLabel } from '@/modules/calendar/date-utils'
import { MEMORY_REPORTS } from '@/modules/mock/coach-mock'

export function MemoryPanel() {
    return (
        <section
            aria-label="What the next report remembers"
            className="rounded-[var(--radius-surface)] border border-ink/10 bg-card p-5"
        >
            <div className="flex items-center gap-2">
                <IconBrain className="size-4 text-muted-foreground" />
                <h2 className="eyebrow text-muted-foreground">What the next report remembers</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
                The coach reads its last {MEMORY_REPORTS.length} reports before writing a new one,
                and checks each earlier concern against the new week. Next week the oldest drops
                out.
            </p>
            <ol className="mt-3 grid gap-2 md:grid-cols-3">
                {MEMORY_REPORTS.map((report, index) => (
                    <li
                        key={report.id}
                        className="rounded-[var(--radius-surface-inner)] bg-muted/60 p-3 text-sm"
                    >
                        <p className="font-mono text-[11px] text-muted-foreground">
                            {index === 0 ? 'Most recent' : `${index + 1} weeks back`},{' '}
                            {shortDateLabel(report.weekStart)}
                        </p>
                        <p className="mt-1 leading-snug">{report.headline}</p>
                    </li>
                ))}
            </ol>
        </section>
    )
}
