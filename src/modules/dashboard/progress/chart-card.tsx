import type { ReactNode } from 'react'

type Props = {
    title: string
    takeaway: string
    testId: string
    controls?: ReactNode
    footnote?: ReactNode
    children: ReactNode
}

// One chart answers one question: a title, the one-line takeaway, the chart, and a footnote.
export function ChartCard({ title, takeaway, testId, controls, footnote, children }: Props) {
    return (
        <section
            data-testid={testId}
            aria-label={title}
            className="min-w-0 space-y-4 rounded-[var(--radius-surface)] shadow-soft bg-card p-4 md:p-5"
        >
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                    <h2 className="display text-xl">{title}</h2>
                    <p data-testid={`${testId}-takeaway`} className="text-sm text-muted-foreground">
                        {takeaway}
                    </p>
                </div>
                {controls}
            </header>
            {children}
            {footnote === undefined ? null : (
                <p className="text-xs text-muted-foreground">{footnote}</p>
            )}
        </section>
    )
}
