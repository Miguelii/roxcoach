import type { DashboardMode } from '@/_bff/core/constants/athlete.constants'
import { formatDuration } from '@/_bff/core/utils/formatters.utils'
import type { CalendarItem } from '@/_bff/modules/training/types'
import { addDays, startOfWeek } from '@/_bff/core/utils/week-dates.utils'
import { Skeleton } from '@/components/ui/skeleton'
import { isoWeekNumber } from '@/modules/calendar/date-utils'
import { cn } from '@/lib/utils'
import { computeLoadRatio, computeTotals, loadLabel } from '@/_bff/core/utils/week-stats.utils'

type Props = {
    items: CalendarItem[]
    today: string
    mode: DashboardMode
}

type LoadingProps = {
    mode: DashboardMode
}

type TileValues = {
    time: string
    sessions: string
    run: string
    load: string
    loadHint: string
}

type TilesProps = {
    mode: DashboardMode
    label: string
    // Null while the week loads.
    values: TileValues | null
}

type TileProps = {
    id: string
    label: string
    value: string | null
    hint: string | null
}

const SO_FAR = 'this week so far'

function Tile({ id, label, value, hint }: TileProps) {
    return (
        <div
            data-testid={`week-tile-${id}`}
            className="rounded-[var(--radius-surface-inner)] shadow-soft bg-card p-4"
        >
            <p className="eyebrow text-muted-foreground">{label}</p>
            {value === null ? (
                <Skeleton data-testid={`week-tile-${id}-loading`} className="mt-2 h-8 w-20" />
            ) : (
                <p data-testid={`week-tile-${id}-value`} className="display mt-1 text-3xl">
                    {value}
                </p>
            )}
            {hint === null ? (
                <Skeleton className="mt-2.5 h-3 w-28 max-w-full" />
            ) : (
                <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
            )}
        </div>
    )
}

function WeekTiles({ mode, label, values }: TilesProps) {
    return (
        <section data-testid="week-strip" aria-label={label} aria-busy={values === null}>
            <div
                className={cn(
                    'grid grid-cols-2 gap-3',
                    mode === 'strength' ? 'lg:grid-cols-3' : 'lg:grid-cols-4'
                )}
            >
                <Tile id="time" label="Time this week" value={values?.time ?? null} hint={SO_FAR} />
                <Tile
                    id="sessions"
                    label="Sessions"
                    value={values?.sessions ?? null}
                    hint={SO_FAR}
                />
                {mode === 'strength' ? null : (
                    <Tile id="run" label="Run distance" value={values?.run ?? null} hint={SO_FAR} />
                )}
                <Tile
                    id="load"
                    label="Load"
                    value={values?.load ?? null}
                    hint={values?.loadHint ?? null}
                />
            </div>
        </section>
    )
}

/**
 * This week at a glance, from the last 35 days of real activities. Time and sessions count the
 * workouts of the mode only (runs in run mode, strength in strength mode), and strength mode has
 * no run distance; the load ratio always uses every activity.
 */
export function WeekStripView({ items, today, mode }: Props) {
    const start = startOfWeek(today)
    const category = mode === 'strength' ? 'strength' : 'run'
    const scoped = items.filter(
        (item) => item.type === 'activity' && item.activity.category === category
    )
    const totals = computeTotals(scoped, start, addDays(start, 6))
    const ratio = computeLoadRatio(items, today)

    return (
        <WeekTiles
            mode={mode}
            label={`Week ${isoWeekNumber(today)} at a glance`}
            values={{
                time:
                    totals.doneMinutes > 0
                        ? (formatDuration(totals.doneMinutes * 60) ?? '0m')
                        : '0m',
                sessions: String(totals.doneSessions),
                run: `${totals.runKm.toFixed(1)} km`,
                load: loadLabel(ratio) ?? 'No history yet',
                loadHint:
                    ratio == null
                        ? 'Needs 4 weeks of history'
                        : `Acute to chronic ratio ${ratio.toFixed(1)}`,
            }}
        />
    )
}

/** The same tiles with their labels while the week loads, so nothing reads as zero before it is known. */
export function WeekStripLoading({ mode }: LoadingProps) {
    return <WeekTiles mode={mode} label="This week at a glance" values={null} />
}
