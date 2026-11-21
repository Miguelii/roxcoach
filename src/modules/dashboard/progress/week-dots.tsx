import { IconCheck } from '@tabler/icons-react'
import { addDays, startOfWeek } from '@/_bff/core/utils/week-dates.utils'
import type { CalendarItem } from '@/_bff/modules/training/types'
import { cn } from '@/lib/utils'
import { dayLabel } from '@/modules/dashboard/progress/progress-utils'

type Props = {
    items: CalendarItem[]
    today: string
}

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// The seven days of this week, a filled circle on every day you ran, today ringed.
export function WeekDots({ items, today }: Props) {
    const start = startOfWeek(today)
    const days = LETTERS.map((letter, offset) => {
        const date = addDays(start, offset)
        const runs = items.filter(
            (item) =>
                item.type === 'activity' &&
                item.activity.category === 'run' &&
                item.activity.localDate === date
        )
        const km = runs.reduce(
            (sum, item) =>
                sum + (item.type === 'activity' ? (item.activity.distanceM ?? 0) / 1000 : 0),
            0
        )
        return { letter, date, ran: runs.length > 0, km }
    })
    const weekKm = days.reduce((sum, day) => sum + day.km, 0)

    return (
        <section
            data-testid="week-dots"
            aria-label="Runs this week"
            className="space-y-3 rounded-[var(--radius-surface)] border border-ink/10 bg-card p-4"
        >
            <header className="flex items-baseline justify-between gap-3">
                <h2 className="display text-lg">This week</h2>
                <p
                    data-testid="week-dots-total"
                    className="text-sm tabular-nums text-muted-foreground"
                >
                    {weekKm.toFixed(1)} km
                </p>
            </header>
            <ol className="grid grid-cols-7 gap-1.5">
                {days.map((day) => (
                    <li
                        key={day.date}
                        data-testid={`week-dot-${day.date}`}
                        data-ran={day.ran}
                        aria-label={`${dayLabel(day.date)}, ${day.ran ? `${day.km.toFixed(1)} km` : 'no run'}`}
                        className="flex flex-col items-center gap-1.5"
                    >
                        <span
                            className={cn(
                                'flex size-9 items-center justify-center rounded-full text-xs font-medium transition-colors sm:size-11',
                                day.ran
                                    ? 'bg-tangerine text-on-brand'
                                    : 'border border-ink/15 text-muted-foreground',
                                day.date === today &&
                                    'ring-2 ring-ink ring-offset-2 ring-offset-card'
                            )}
                        >
                            {day.ran ? (
                                <IconCheck className="size-5" aria-hidden="true" />
                            ) : (
                                day.letter
                            )}
                        </span>
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                            {day.ran ? day.km.toFixed(1) : day.letter}
                        </span>
                    </li>
                ))}
            </ol>
        </section>
    )
}
