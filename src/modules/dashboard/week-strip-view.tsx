import { formatDuration } from '@/_bff/core/utils/formatters.utils'
import type { CalendarItem } from '@/_bff/modules/training/types'
import { addDays, startOfWeek } from '@/_bff/core/utils/week-dates.utils'
import { isoWeekNumber } from '@/modules/calendar/date-utils'
import { computeLoadRatio, computeTotals, loadLabel } from '@/_bff/core/utils/week-stats.utils'

type Props = {
    items: CalendarItem[]
    today: string
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

/** This week at a glance, from the last 35 days of real activities. */
export function WeekStripView({ items, today }: Props) {
    const start = startOfWeek(today)
    const totals = computeTotals(items, start, addDays(start, 6))
    const ratio = computeLoadRatio(items, today)

    return (
        <section data-testid="week-strip" aria-label={`Week ${isoWeekNumber(today)} at a glance`}>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
                <Tile
                    id="run"
                    label="Run distance"
                    value={`${totals.runKm.toFixed(1)} km`}
                    hint="this week so far"
                />
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
