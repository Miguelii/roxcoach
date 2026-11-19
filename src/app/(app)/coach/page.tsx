import type { Metadata } from 'next'
import { IconChevronDown } from '@tabler/icons-react'
import { isoWeekNumber, longDateLabel, shortDateLabel } from '@/modules/calendar/date-utils'
import { GenerateNowDialog } from '@/modules/coach/generate-now-dialog'
import { MemoryPanel } from '@/modules/coach/memory-panel'
import { ReportBody } from '@/modules/coach/report-body'
import { LATEST_REPORT, NEXT_REPORT_DATE, REPORTS } from '@/modules/mock/coach-mock'

export const metadata: Metadata = { title: 'Coach' }

export default function CoachPage() {
    const earlier = REPORTS.slice(1)

    return (
        <main className="main-container">
            <div className="flex flex-wrap items-end gap-3">
                <div>
                    <h1 className="display display-section">Coach</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Next report: {longDateLabel(NEXT_REPORT_DATE)}, 20:00. It reviews this week
                        and writes the next one.
                    </p>
                </div>
                <div className="ml-auto">
                    <GenerateNowDialog />
                </div>
            </div>

            {LATEST_REPORT && (
                <section
                    aria-label="Latest report"
                    className="space-y-4 rounded-[var(--radius-surface)] border border-ink/10 bg-card p-6"
                >
                    <p className="eyebrow text-muted-foreground">
                        Week {isoWeekNumber(LATEST_REPORT.weekStart)},{' '}
                        {shortDateLabel(LATEST_REPORT.weekStart)} to{' '}
                        {shortDateLabel(LATEST_REPORT.weekEnd)}
                    </p>
                    <h2 className="text-2xl font-semibold leading-snug">
                        {LATEST_REPORT.headline}
                    </h2>
                    <ReportBody report={LATEST_REPORT} />
                </section>
            )}

            <MemoryPanel />

            <section aria-label="Earlier reports" className="space-y-3">
                <h2 className="display text-3xl">Earlier reports</h2>
                {earlier.map((report) => (
                    <details
                        key={report.id}
                        className="group rounded-[var(--radius-surface-inner)] border border-ink/10 bg-card"
                    >
                        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                            <span className="font-mono text-xs text-muted-foreground">
                                W{isoWeekNumber(report.weekStart)},{' '}
                                {shortDateLabel(report.weekStart)}
                            </span>
                            <span className="text-sm font-medium">{report.headline}</span>
                            <IconChevronDown className="ml-auto size-4 shrink-0 transition group-open:rotate-180" />
                        </summary>
                        <div className="border-t border-hairline p-4">
                            <ReportBody report={report} />
                        </div>
                    </details>
                ))}
            </section>
        </main>
    )
}
