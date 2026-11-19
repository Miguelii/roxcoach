import { getItemKey } from '@/modules/calendar/item-key'
import { CalendarChip } from '@/modules/calendar/calendar-chip'
import { dayOfMonth, WEEKDAY_LABELS } from '@/modules/calendar/date-utils'
import { TODAY } from '@/modules/mock/data'
import type { CalendarItem } from '@/modules/mock/types'
import { cn } from '@/lib/utils'

type Props = {
    days: string[]
    items: CalendarItem[]
    onSelectDay: (date: string) => void
}

/** Seven columns on desktop, a stacked agenda on mobile. */
export function WeekView({ days, items, onSelectDay }: Props) {
    return (
        <div className="grid gap-2 md:grid-cols-7">
            {days.map((date, index) => {
                const dayItems = items.filter((item) => item.date === date)

                return (
                    <div
                        key={date}
                        className={cn(
                            'rounded-[var(--radius-surface-inner)] border border-ink/10 bg-card p-2.5 md:min-h-64',
                            date === TODAY && 'ring-2 ring-ink'
                        )}
                    >
                        <button
                            type="button"
                            onClick={() => onSelectDay(date)}
                            className="mb-2 flex w-full items-baseline gap-2 text-left"
                            aria-label={`Open ${date}`}
                        >
                            <span className="eyebrow text-muted-foreground">
                                {WEEKDAY_LABELS[index]}
                            </span>
                            <span className="font-mono text-sm">{dayOfMonth(date)}</span>
                            {date === TODAY && (
                                <span className="ml-auto rounded-full bg-ink px-2 py-0.5 text-[10px] text-primary-foreground">
                                    Today
                                </span>
                            )}
                        </button>
                        <div className="space-y-1.5">
                            {dayItems.map((item) => (
                                <CalendarChip
                                    key={getItemKey(item)}
                                    item={item}
                                    onSelect={() => onSelectDay(date)}
                                />
                            ))}
                            {dayItems.length === 0 && (
                                <p className="text-xs text-muted-foreground">Rest</p>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
