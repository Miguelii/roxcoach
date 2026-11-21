import type { DashboardMode } from '@/_bff/core/constants/athlete.constants'
import { formatDuration } from '@/_bff/core/utils/formatters.utils'
import type { CalendarItem } from '@/_bff/modules/training/types'
import { addDays, startOfWeek } from '@/_bff/core/utils/week-dates.utils'
import { isoWeekNumber } from '@/modules/calendar/date-utils'
import { cn } from '@/lib/utils'
import { computeLoadRatio, computeTotals, loadLabel } from '@/_bff/core/utils/week-stats.utils'

type Props = {
    items: CalendarItem[]
    today: string
    mode: DashboardMode
}

type TileProps = {
    id: string
    label: string
    value: string
    hint: string
}

function Tile({ id, label, value, hint }: TileProps) {
    return (
        <div
            data-testid={`week-tile-${id}`}
            className="rounded-[var(--radius-surface-inner)] border border-ink/10 bg-card p-4"
        >
            <p className="eyebrow text-muted-foreground">{label}</p>
            <p data-testid={`week-tile-${id}-value`} className="display mt-1 text-3xl">
                {value}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
        </div>
    )
}

/**
 * This week at a glance, from the last 35 days of real activities. In strength mode time and
 * sessions count strength workouts only and there is no run distance; the load ratio always uses
 * every activity.
 */
export function WeekStripView({ items, today, mode }: Props) {
    const start = startOfWeek(today)
    const scoped =
        mode === 'strength'
            ? items.filter(
                  (item) => item.type === 'activity' && item.activity.category === 'strength'
              )
            : items
    const totals = computeTotals(scoped, start, addDays(start, 6))
    const ratio = computeLoadRatio(items, today)

    return (
        <section data-testid="week-strip" aria-label={`Week ${isoWeekNumber(today)} at a glance`}>
            <div
                className={cn(
                    'grid grid-cols-2 gap-3',
                    mode === 'strength' ? 'lg:grid-cols-3' : 'lg:grid-cols-4'
                )}
            >
                <Tile
                    id="time"
                    label="Time this week"
                    value={
                        totals.doneMinutes > 0
                            ? (formatDuration(totals.doneMinutes * 60) ?? '0m')
                            : '0m'
                    }
                    hint="this week so far"
                />
                <Tile
                    id="sessions"
                    label="Sessions"
                    value={String(totals.doneSessions)}
                    hint="this week so far"
                />
                {mode === 'strength' ? null : (
                    <Tile
                        id="run"
                        label="Run distance"
                        value={`${totals.runKm.toFixed(1)} km`}
                        hint="this week so far"
                    />
                )}
                <Tile
                    id="load"
                    label="Load"
                    value={loadLabel(ratio) ?? 'No history yet'}
                    hint={
                        ratio == null
                            ? 'Needs 4 weeks of history'
                            : `Acute to chronic ratio ${ratio.toFixed(1)}`
                    }
                />
            </div>
        </section>
    )
}
