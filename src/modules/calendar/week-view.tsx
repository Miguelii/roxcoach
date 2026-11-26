import type { CalendarItem } from '@/_bff/modules/training/types'
import { getItemKey } from '@/modules/calendar/item-key'
import { CalendarChip } from '@/modules/calendar/calendar-chip'
import { Skeleton } from '@/components/ui/skeleton'
import { dayOfMonth, WEEKDAY_LABELS } from '@/modules/calendar/date-utils'
import { cn } from '@/lib/utils'

type Props = {
    days: string[]
    today: string
    items: CalendarItem[]
    isLoading: boolean
    onSelectDay: (date: string) => void
}

/** Seven columns on desktop, a stacked agenda on mobile. */
export function WeekView({ days, today, items, isLoading, onSelectDay }: Props) {
    return (
        <div data-testid="week-view" aria-busy={isLoading} className="grid gap-2 md:grid-cols-7">
            {days.map((date, index) => {
                const dayItems = items.filter((item) => item.date === date)

                return (
                    <div
                        key={date}
                        data-testid={`week-day-${date}`}
                        data-today={date === today}
                        className={cn(
                            'rounded-[var(--radius-surface-inner)] shadow-soft bg-card p-2.5 md:min-h-64',
                            date === today && 'ring-2 ring-ink'
                        )}
                    >
                        <button
                            type="button"
                            data-testid={`week-day-${date}-open`}
                            onClick={() => onSelectDay(date)}
                            className="mb-2 flex w-full items-baseline gap-2 text-left"
                            aria-label={`Open ${date}`}
                        >
                            <span className="eyebrow text-muted-foreground">
                                {WEEKDAY_LABELS[index]}
                            </span>
                            <span className="font-mono text-sm">{dayOfMonth(date)}</span>
                            {date === today && (
                                <span className="ml-auto rounded-full bg-ink px-2 py-0.5 text-[10px] text-primary-foreground">
                                    Today
                                </span>
                            )}
                        </button>
                        <div className="space-y-1.5">
                            {dayItems.map((item) => (
                                <CalendarChip key={getItemKey(item)} item={item} touch />
                            ))}
                            {isLoading ? (
                                <Skeleton
                                    data-testid={`week-day-${date}-loading`}
                                    className="h-4 w-10"
                                />
                            ) : (
                                dayItems.length === 0 && (
                                    <p className="text-xs text-muted-foreground">Rest</p>
                                )
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
