import { IconTrendingDown, IconTrendingUp } from '@tabler/icons-react'
import { formatKg } from '@/_bff/core/utils/formatters.utils'
import type { TopExerciseDTO } from '@/_bff/modules/training/types/progress'
import { PrMedal } from '@/components/pr-medal'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { ExerciseThumb } from '@/modules/dashboard/progress/exercise-thumb'
import { strengthSummary } from '@/modules/dashboard/progress/progress-utils'

type Props = {
    exercises: TopExerciseDTO[]
}

type Tile = {
    id: string
    label: string
    value: string
    hint?: string
    // Shows the exercise picture beside the hint.
    picture?: { imageUrl: string | null }
}

const TEST_ID = 'strength-overview'

const LABELS = {
    progressing: 'Progressing',
    records: 'Top set records',
    heaviest: 'Heaviest top set',
    reps: 'Top set reps',
} as const

const CARD = 'space-y-6 rounded-[var(--radius-surface)] bg-card p-5 shadow-soft md:p-6'
const TILES = 'grid grid-cols-2 gap-y-6 lg:grid-cols-4'
const TILE = cn(
    'min-w-0 space-y-1 border-hairline',
    'max-lg:odd:pr-4 max-lg:even:border-l max-lg:even:pl-4',
    'lg:border-l lg:px-5 lg:first:border-l-0 lg:first:pl-0'
)

const signedReps = (value: number) => {
    const rounded = Math.round(value * 10) / 10
    if (rounded === 0) return 'no change'
    return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded)} reps`
}

export function StrengthOverviewCard({ exercises }: Props) {
    const summary = strengthSummary(exercises)
    const parts = [
        `${summary.progressing} progressing`,
        summary.mixed === 0 ? null : `${summary.mixed} trading weight and reps`,
        `${summary.steady} holding steady`,
        `${summary.declining} slipping`,
    ].filter((part) => part !== null)
    const takeaway =
        summary.rated === 0
            ? 'Not enough workouts to compare yet.'
            : `${parts.join(', ')} across your ${summary.rated} most used lifts.`

    const tiles: Tile[] = [
        {
            id: 'progressing',
            label: LABELS.progressing,
            value: `${summary.progressing} of ${summary.rated}`,
        },
        {
            id: 'records',
            label: LABELS.records,
            value: String(summary.records),
        },
        {
            id: 'heaviest',
            label: LABELS.heaviest,
            value:
                summary.heaviest === null
                    ? '-'
                    : `${formatKg(summary.heaviest.topSetKg)} x ${summary.heaviest.topSetReps}`,
            hint: summary.heaviest?.name,
            picture:
                summary.heaviest === null ? undefined : { imageUrl: summary.heaviest.imageUrl },
        },
        {
            id: 'reps',
            label: LABELS.reps,
            value: summary.avgRepsDelta === null ? '-' : signedReps(summary.avgRepsDelta),
            hint: summary.avgRepsDelta === null ? undefined : 'average change per lift',
        },
    ]

    return (
        <section data-testid={TEST_ID} aria-label="Progress summary" className="min-w-0">
            <div className={CARD}>
                <header className="space-y-1">
                    <h2 className="display text-xl">Progress summary</h2>
                    <p
                        data-testid={`${TEST_ID}-takeaway`}
                        className="text-sm text-muted-foreground"
                    >
                        {takeaway}
                    </p>
                </header>

                <dl className={TILES}>
                    {tiles.map((tile) => (
                        <div key={tile.id} className={TILE}>
                            <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                {tile.label}
                                {tile.id === 'records' && <PrMedal className="size-5" />}
                            </dt>
                            <dd
                                data-testid={`${TEST_ID}-${tile.id}`}
                                className="display text-3xl text-ink tabular-nums"
                            >
                                {tile.value}
                            </dd>
                            {tile.hint === undefined ? null : (
                                <div className="flex items-center gap-2 pt-1">
                                    {tile.picture === undefined ? null : (
                                        <ExerciseThumb
                                            imageUrl={tile.picture.imageUrl}
                                            testId={`${TEST_ID}-${tile.id}`}
                                        />
                                    )}
                                    <p className="min-w-0 text-xs leading-snug text-muted-foreground [overflow-wrap:anywhere]">
                                        {tile.hint}
                                    </p>
                                </div>
                            )}
                        </div>
                    ))}
                </dl>

                {summary.bestGain === null && summary.slipping.length === 0 ? null : (
                    <div className="divide-y divide-hairline border-t border-hairline">
                        {summary.bestGain === null ? null : (
                            <div
                                data-testid={`${TEST_ID}-best-gain`}
                                className="flex items-center gap-3 py-3.5 last:pb-0"
                            >
                                <ExerciseThumb
                                    imageUrl={summary.bestGain.imageUrl}
                                    testId={`${TEST_ID}-best-gain`}
                                />
                                <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[15px]">
                                    <span className="font-semibold text-ink">Biggest gain</span>
                                    <span className="text-ink [overflow-wrap:anywhere]">
                                        {summary.bestGain.name}
                                    </span>
                                    <span className="inline-flex items-center gap-0.5 self-center text-sm font-medium text-green-deep tabular-nums">
                                        <IconTrendingUp className="size-4" aria-hidden="true" />+
                                        {formatKg(summary.bestGain.loadDeltaKg)}
                                    </span>
                                </p>
                            </div>
                        )}
                        {summary.slipping.length === 0 ? null : (
                            <ul
                                data-testid={`${TEST_ID}-slipping`}
                                className="divide-y divide-hairline"
                            >
                                {summary.slipping.map((lift, index) => (
                                    <li
                                        key={lift.name}
                                        data-testid={`${TEST_ID}-slipping-${index}`}
                                        className="flex items-center gap-3 py-3.5 last:pb-0"
                                    >
                                        <ExerciseThumb
                                            imageUrl={lift.imageUrl}
                                            testId={`${TEST_ID}-slipping-${index}`}
                                        />
                                        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[15px]">
                                            <span className="inline-flex items-center gap-1 self-center font-semibold text-ink">
                                                <IconTrendingDown
                                                    className="size-4 text-red-deep"
                                                    aria-hidden="true"
                                                />
                                                Slipping
                                            </span>
                                            <span className="text-ink [overflow-wrap:anywhere]">
                                                {lift.name}
                                            </span>
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>
        </section>
    )
}

/** The summary card with its tile labels while the lifts load. */
export function StrengthOverviewLoading() {
    return (
        <section
            data-testid={`${TEST_ID}-loading`}
            aria-label="Progress summary"
            aria-busy
            className="min-w-0"
        >
            <div className={CARD}>
                <header className="space-y-2">
                    <h2 className="display text-xl">Progress summary</h2>
                    <Skeleton className="h-4 w-72 max-w-full" />
                </header>
                <dl className={TILES}>
                    {Object.entries(LABELS).map(([id, label]) => (
                        <div key={id} className={TILE}>
                            <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                {label}
                                {id === 'records' && <PrMedal className="size-5" />}
                            </dt>
                            <dd>
                                <Skeleton className="mt-1 h-8 w-16" />
                            </dd>
                        </div>
                    ))}
                </dl>
            </div>
        </section>
    )
}
