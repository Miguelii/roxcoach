import { formatDuration } from '@/_bff/core/utils/formatters.utils'
import { getItemKey } from '@/modules/calendar/item-key'
import { CalendarChip } from '@/modules/calendar/calendar-chip'
import { dayOfMonth, isoWeekNumber, WEEKDAY_LABELS } from '@/modules/calendar/date-utils'
import { computeTotals } from '@/modules/calendar/week-stats'
import { TODAY } from '@/modules/mock/data'
import type { CalendarItem } from '@/modules/mock/types'
import { cn } from '@/lib/utils'

type Props = {
    weeks: string[][]
    month: string
    items: CalendarItem[]
    onSelectDay: (date: string) => void
}

const MAX_CHIPS = 3

const sortItems = (items: CalendarItem[]) => {
    const order = { race: 0, activity: 1, planned: 2 }
    return items.toSorted((a, b) => order[a.type] - order[b.type])
}

export function MonthView({ weeks, month, items, onSelectDay }: Props) {
    return (
        <div className="overflow-hidden rounded-[var(--radius-surface)] border border-ink/10 bg-card">
            <div className="grid grid-cols-7 border-b border-hairline lg:grid-cols-[repeat(7,minmax(0,1fr))_150px]">
                {WEEKDAY_LABELS.map((label) => (
                    <div key={label} className="eyebrow px-2 py-2 text-muted-foreground">
                        {label}
                    </div>
                ))}
                <div className="eyebrow hidden px-3 py-2 text-muted-foreground lg:block">Week</div>
            </div>

            {weeks.map((week) => {
                const totals = computeTotals(items, week[0] ?? '', week[6] ?? '')
                const progress = totals.plannedMinutes
                    ? Math.min(100, (totals.doneMinutes / totals.plannedMinutes) * 100)
                    : 0

                return (
                    <div
                        key={week[0]}
                        className="grid grid-cols-7 border-b border-hairline last:border-b-0 lg:grid-cols-[repeat(7,minmax(0,1fr))_150px]"
                    >
                        {week.map((date) => {
                            const dayItems = sortItems(items.filter((item) => item.date === date))
                            const outside = date.slice(0, 7) !== month.slice(0, 7)

                            return (
                                // The day button below is the keyboard path; the cell click is a pointer shortcut
                                <div
                                    key={date}
                                    onClick={() => onSelectDay(date)}
                                    className={cn(
                                        'min-h-28 cursor-pointer space-y-1 border-r border-hairline p-1.5 transition-colors hover:bg-muted/60',
                                        outside && 'bg-muted/40'
                                    )}
                                >
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            onSelectDay(date)
                                        }}
                                        aria-label={`Open ${date}`}
                                        className={cn(
                                            'flex size-6 items-center justify-center rounded-full font-mono text-xs',
                                            date === TODAY
                                                ? 'bg-ink text-primary-foreground'
                                                : outside
                                                  ? 'text-muted-foreground/60'
                                                  : 'text-ink'
                                        )}
                                    >
                                        {dayOfMonth(date)}
                                    </button>
                                    {dayItems.slice(0, MAX_CHIPS).map((item) => (
                                        <CalendarChip
                                            key={getItemKey(item)}
                                            item={item}
                                            onSelect={() => onSelectDay(date)}
                                        />
                                    ))}
                                    {dayItems.length > MAX_CHIPS && (
                                        <p className="px-1 font-mono text-[11px] text-muted-foreground">
                                            +{dayItems.length - MAX_CHIPS} more
                                        </p>
                                    )}
                                </div>
                            )
                        })}

                        <div className="hidden space-y-1.5 bg-muted/30 p-3 lg:block">
                            <p className="font-mono text-[11px] text-muted-foreground">
                                W{isoWeekNumber(week[0] ?? '')}
                            </p>
                            {totals.totalSessions > 0 ? (
                                <>
                                    <p className="text-sm font-semibold">
                                        {formatDuration(totals.doneMinutes * 60)}
                                        <span className="font-normal text-muted-foreground">
                                            {' '}
                                            / {formatDuration(totals.plannedMinutes * 60)}
                                        </span>
                                    </p>
                                    <div
                                        role="progressbar"
                                        aria-label="Week volume done"
                                        aria-valuenow={Math.round(progress)}
                                        className="h-1.5 overflow-hidden rounded-full bg-ink/10"
                                    >
                                        <div
                                            className="h-full rounded-full bg-green"
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                    <p className="font-mono text-[11px] text-muted-foreground">
                                        {totals.doneSessions}/{totals.totalSessions} sessions
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
        </div>
    )
}
