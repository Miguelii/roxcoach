import { formatDuration } from '@/_bff/core/utils/formatters.utils'
import type { CalendarItem } from '@/_bff/modules/training/types'
import { getItemKey } from '@/modules/calendar/item-key'
import { CalendarChip } from '@/modules/calendar/calendar-chip'
import { dayOfMonth, isoWeekNumber, WEEKDAY_LABELS } from '@/modules/calendar/date-utils'
import { computeTotals } from '@/_bff/core/utils/week-stats.utils'
import { cn } from '@/lib/utils'

type Props = {
    weeks: string[][]
    month: string
    today: string
    items: CalendarItem[]
    onSelectDay: (date: string) => void
}

const MAX_CHIPS = 3

const HEADER_CELL =
    'px-3 py-2.5 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase'

export function MonthView({ weeks, month, today, items, onSelectDay }: Props) {
    return (
        <div
            data-testid="month-view"
            className="overflow-hidden rounded-[var(--radius-surface)] shadow-soft bg-card border border-card"
        >
            <div className="grid grid-cols-7 border-b border-hairline bg-sunken/50 lg:grid-cols-[repeat(7,minmax(0,1fr))_150px]">
                {WEEKDAY_LABELS.map((label) => (
                    <div key={label} className={HEADER_CELL}>
                        {label}
                    </div>
                ))}
                <div className={cn(HEADER_CELL, 'hidden lg:block')}>Week</div>
            </div>

            {weeks.map((week) => {
                const totals = computeTotals(items, week[0] ?? '', week[6] ?? '')

                return (
                    <div
                        key={week[0]}
                        className="grid grid-cols-7 border-b border-hairline last:border-b-0 lg:grid-cols-[repeat(7,minmax(0,1fr))_150px]"
                    >
                        {week.map((date) => {
                            const dayItems = items.filter((item) => item.date === date)
                            const outside = date.slice(0, 7) !== month.slice(0, 7)

                            return (
                                // The day button below is the keyboard path; the cell click is a pointer shortcut
                                <div
                                    key={date}
                                    data-testid={`month-day-${date}`}
                                    data-today={date === today}
                                    onClick={() => onSelectDay(date)}
                                    className={cn(
                                        'min-h-28 cursor-pointer space-y-1 border-r border-hairline p-1.5 transition-colors hover:bg-muted/60',
                                        outside && 'bg-muted/40'
                                    )}
                                >
                                    <button
                                        type="button"
                                        data-testid={`month-day-${date}-open`}
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            onSelectDay(date)
                                        }}
                                        aria-label={`Open ${date}`}
                                        className={cn(
                                            'flex size-6 items-center justify-center rounded-full font-mono text-xs',
                                            date === today
                                                ? 'bg-ink text-primary-foreground'
                                                : outside
                                                  ? 'text-muted-foreground/60'
                                                  : 'text-ink'
                                        )}
                                    >
                                        {dayOfMonth(date)}
                                    </button>
                                    {dayItems.slice(0, MAX_CHIPS).map((item) => (
                                        <CalendarChip key={getItemKey(item)} item={item} />
                                    ))}
                                    {dayItems.length > MAX_CHIPS && (
                                        <p
                                            data-testid={`month-day-${date}-more`}
                                            className="px-1 font-mono text-[11px] text-muted-foreground"
                                        >
                                            +{dayItems.length - MAX_CHIPS} more
                                        </p>
                                    )}
                                </div>
                            )
                        })}

                        <div
                            data-testid={`week-summary-${week[0]}`}
                            className="hidden space-y-1.5 bg-muted/30 p-3 lg:block"
                        >
                            <p className="font-mono text-[11px] text-muted-foreground">
                                W{isoWeekNumber(week[0] ?? '')}
                            </p>
                            {totals.doneSessions > 0 ? (
                                <>
                                    <p className="text-sm font-semibold">
                                        {formatDuration(totals.doneMinutes * 60)}
                                    </p>
                                    <p className="font-mono text-[11px] text-muted-foreground">
                                        {totals.doneSessions}{' '}
                                        {totals.doneSessions === 1 ? 'session' : 'sessions'}
                                        {totals.runKm > 0 && `  ·  ${totals.runKm.toFixed(1)} km`}
                                    </p>
                                </>
                            ) : (
                                <p className="text-xs text-muted-foreground">No sessions</p>
                            )}
                        </div>
                    </div>
                )
            })}

            {items.length === 0 && (
                <p
                    data-testid="month-empty"
                    className="border-t border-hairline p-4 text-sm text-muted-foreground"
                >
                    No activities in this period. Uploaded activities appear here.
                </p>
            )}
        </div>
    )
}
