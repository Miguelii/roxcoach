import { formatDuration } from '@/_bff/core/utils/formatters.utils'
import { addDays, isoWeekNumber, startOfWeek } from '@/modules/calendar/date-utils'
import { computeLoadRatio, computeTotals, loadLabel } from '@/modules/calendar/week-stats'
import { CALENDAR_ITEMS, TODAY } from '@/modules/mock/data'

type TileProps = {
    label: string
    value: string
    hint: string
    progress?: number
}

function Tile({ label, value, hint, progress }: TileProps) {
    return (
        <div className="rounded-[var(--radius-surface-inner)] border border-ink/10 bg-card p-4">
            <p className="eyebrow text-muted-foreground">{label}</p>
            <p className="display mt-1 text-3xl">{value}</p>
            {progress !== undefined && (
                <div
                    role="progressbar"
                    aria-label={label}
                    aria-valuenow={Math.round(progress)}
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10"
                >
                    <div
                        className="h-full rounded-full bg-green"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
        </div>
    )
}

export function WeekStrip() {
    const start = startOfWeek(TODAY)
    const totals = computeTotals(CALENDAR_ITEMS, start, addDays(start, 6))
    const ratio = computeLoadRatio(CALENDAR_ITEMS, TODAY)
    const progress = totals.plannedMinutes ? (totals.doneMinutes / totals.plannedMinutes) * 100 : 0

    return (
        <section aria-label={`Week ${isoWeekNumber(TODAY)} at a glance`}>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Tile
                    label="Time this week"
                    value={formatDuration(totals.doneMinutes * 60) ?? '0m'}
                    hint={`of ${formatDuration(totals.plannedMinutes * 60)} planned`}
                    progress={progress}
                />
                <Tile
                    label="Sessions"
                    value={`${totals.doneSessions} / ${totals.totalSessions}`}
                    hint="done of planned"
                />
                <Tile
                    label="Run distance"
                    value={`${totals.runKm.toFixed(1)} km`}
                    hint="this week so far"
                />
                <Tile
                    label="Load"
                    value={loadLabel(ratio) ?? 'No data'}
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
