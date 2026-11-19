import Link from 'next/link'
import { IconArrowRight } from '@tabler/icons-react'
import { isoWeekNumber, longDateLabel } from '@/modules/calendar/date-utils'
import { LATEST_REPORT, NEXT_REPORT_DATE } from '@/modules/mock/coach-mock'

export function LatestReport() {
    if (!LATEST_REPORT) return null

    return (
        <section
            aria-label="Latest weekly report"
            className="rounded-[var(--radius-surface)] border border-ink/10 bg-card p-5"
        >
            <div className="flex flex-wrap items-center gap-2">
                <p className="eyebrow text-muted-foreground">
                    Coach report, week {isoWeekNumber(LATEST_REPORT.weekStart)}
                </p>
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                    Next: {longDateLabel(NEXT_REPORT_DATE)}, 20:00
                </span>
            </div>
            <p className="mt-2 text-lg font-semibold leading-snug">{LATEST_REPORT.headline}</p>
            <p className="mt-2 text-sm text-muted-foreground">
                Focus: {LATEST_REPORT.nextWeekFocus}
            </p>
            <Link
                href="/coach"
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
            >
                Read the full report <IconArrowRight className="size-4" />
            </Link>
        </section>
    )
}
