import Link from 'next/link'
import { CheckIcon } from 'lucide-react'
import type { DashboardMode } from '@/_bff/core/constants/athlete.constants'
import { formatKmNumber } from '@/_bff/core/utils/formatters.utils'
import type { WeeklyGoalProgress } from '@/_bff/core/utils/weekly-goals.utils'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type Props = {
    progress: WeeklyGoalProgress
    mode: DashboardMode
}

type GoalId = 'distance' | 'long' | 'fast' | 'strength'

type GoalRowProps = {
    id: GoalId
    label: string
    value: string
    remaining: string
    met: boolean
    ratio?: number
}

type CardShellProps = {
    children: React.ReactNode
    daysLeft?: number
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

const stillNeed = (remaining: number, kind: string) =>
    remaining === 1 ? `You still need a ${kind} run` : `You still need ${remaining} ${kind} runs`

const daysLeftLabel = (daysLeft: number) =>
    daysLeft <= 1 ? 'Last day' : `${plural(daysLeft, 'day')} left`

function CardShell({ children, daysLeft }: CardShellProps) {
    return (
        <section
            data-testid="weekly-goals-card"
            aria-label="This week's goals"
            className="min-h-40 rounded-[var(--radius-surface-inner)] bg-card p-4 shadow-soft"
        >
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="eyebrow text-muted-foreground">This week&apos;s goals</h2>
                {daysLeft === undefined ? null : (
                    <p
                        data-testid="weekly-goals-days-left"
                        className="text-xs text-muted-foreground"
                    >
                        {daysLeftLabel(daysLeft)}
                    </p>
                )}
            </div>
            {children}
        </section>
    )
}

function GoalRow({ id, label, value, remaining, met, ratio }: GoalRowProps) {
    return (
        <li
            data-testid={`weekly-goal-${id}`}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[8rem_minmax(6rem,auto)_minmax(0,1fr)_auto]"
        >
            <span className="text-sm">{label}</span>
            <span
                data-testid={`weekly-goal-${id}-value`}
                className="text-right text-sm tabular-nums sm:text-left"
            >
                {value}
            </span>
            {ratio === undefined ? (
                <span className="hidden sm:block" />
            ) : (
                <div
                    role="progressbar"
                    aria-label={label}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(ratio * 100)}
                    className="col-span-2 h-2 overflow-hidden rounded-full bg-muted sm:col-span-1"
                >
                    <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${ratio * 100}%` }}
                    />
                </div>
            )}
            <span
                data-testid={`weekly-goal-${id}-remaining`}
                className={cn(
                    'col-span-2 flex items-center gap-1 text-sm sm:col-span-1 sm:justify-end',
                    met ? 'text-foreground' : 'text-muted-foreground'
                )}
            >
                {met ? (
                    <CheckIcon
                        data-testid={`weekly-goal-${id}-done-icon`}
                        aria-hidden
                        className="size-4"
                    />
                ) : null}
                {remaining}
            </span>
        </li>
    )
}

/** What is left of this week's goals for the current mode, or a link to set them. */
export function WeeklyGoalsCardView({ progress, mode }: Props) {
    const { distanceM, longRuns, fastRuns, strengthSessions } = progress
    const rows: GoalRowProps[] = []

    if (mode === 'run') {
        if (distanceM)
            rows.push({
                id: 'distance',
                label: 'Weekly distance',
                value: `${formatKmNumber(distanceM.done)} / ${formatKmNumber(distanceM.goal)} km`,
                remaining:
                    distanceM.remaining === 0
                        ? 'Done'
                        : `${formatKmNumber(distanceM.remaining)} km to go`,
                met: distanceM.remaining === 0,
                ratio: distanceM.goal > 0 ? Math.min(distanceM.done / distanceM.goal, 1) : 1,
            })
        if (longRuns)
            rows.push({
                id: 'long',
                label: 'Long runs',
                value: `${longRuns.done} / ${longRuns.goal}`,
                remaining:
                    longRuns.remaining === 0 ? 'Done' : stillNeed(longRuns.remaining, 'long'),
                met: longRuns.remaining === 0,
            })
        if (fastRuns)
            rows.push({
                id: 'fast',
                label: 'Fast runs',
                value: `${fastRuns.done} / ${fastRuns.goal}`,
                remaining:
                    fastRuns.remaining === 0 ? 'Done' : stillNeed(fastRuns.remaining, 'fast'),
                met: fastRuns.remaining === 0,
            })
    } else if (strengthSessions) {
        rows.push({
            id: 'strength',
            label: 'Strength sessions',
            value: `${strengthSessions.done} / ${strengthSessions.goal}`,
            remaining:
                strengthSessions.remaining === 0
                    ? 'Done'
                    : `${plural(strengthSessions.remaining, 'more strength session')} to go`,
            met: strengthSessions.remaining === 0,
        })
    }

    if (rows.length === 0)
        return (
            <CardShell>
                <p data-testid="weekly-goals-empty" className="mt-3 text-sm text-muted-foreground">
                    <Link
                        data-testid="weekly-goals-empty-link"
                        href="/settings?tab=goals"
                        className="underline underline-offset-4 hover:text-foreground"
                    >
                        Set weekly goals to see what is left this week
                    </Link>
                </p>
            </CardShell>
        )

    return (
        <CardShell daysLeft={progress.daysLeft}>
            <ul className="mt-3 space-y-3">
                {rows.map((row) => (
                    <GoalRow key={row.id} {...row} />
                ))}
            </ul>
        </CardShell>
    )
}

/** A skeleton with the card's height, so the dashboard does not jump when the goals arrive. */
export function WeeklyGoalsCardLoading() {
    return (
        <section
            data-testid="weekly-goals-loading"
            aria-label="This week's goals"
            aria-busy
            className="min-h-40 rounded-[var(--radius-surface-inner)] bg-card p-4 shadow-soft"
        >
            <Skeleton className="h-3 w-32" />
            <div className="mt-4 space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-2/3" />
            </div>
        </section>
    )
}
