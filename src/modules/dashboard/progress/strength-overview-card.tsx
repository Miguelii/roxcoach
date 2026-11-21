import {
    IconBarbell,
    IconRepeat,
    IconTrendingDown,
    IconTrendingUp,
    IconTrophy,
    type Icon,
} from '@tabler/icons-react'
import { formatKg } from '@/_bff/core/utils/formatters.utils'
import type { TopExerciseDTO } from '@/_bff/modules/training/types/progress'
import { cn } from '@/lib/utils'
import { strengthSummary } from '@/modules/dashboard/progress/progress-utils'

type Props = {
    exercises: TopExerciseDTO[]
}

type Tile = {
    id: string
    label: string
    value: string
    hint?: string
    tone: 'green' | 'amber' | 'plum' | 'blue'
    Icon: Icon
}

const TEST_ID = 'strength-overview'

const SEGMENT_TONES = {
    progressing: 'green',
    mixed: 'blue',
    steady: 'slate',
    declining: 'tangerine',
} as const

const VERDICT_ORDER = ['progressing', 'mixed', 'steady', 'declining'] as const

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

    const segments = VERDICT_ORDER.flatMap((verdict) =>
        Array.from({ length: summary[verdict] }, () => verdict)
    )

    const tiles: Tile[] = [
        {
            id: 'progressing',
            label: 'Progressing',
            value: `${summary.progressing} of ${summary.rated}`,
            tone: 'green',
            Icon: IconTrendingUp,
        },
        {
            id: 'records',
            label: 'Top set records',
            value: String(summary.records),
            tone: 'amber',
            Icon: IconTrophy,
        },
        {
            id: 'heaviest',
            label: 'Heaviest top set',
            value:
                summary.heaviest === null
                    ? '-'
                    : `${formatKg(summary.heaviest.topSetKg)} x ${summary.heaviest.topSetReps}`,
            hint: summary.heaviest?.name,
            tone: 'plum',
            Icon: IconBarbell,
        },
        {
            id: 'reps',
            label: 'Top set reps',
            value: summary.avgRepsDelta === null ? '-' : signedReps(summary.avgRepsDelta),
            hint: summary.avgRepsDelta === null ? undefined : 'average change per lift',
            tone: 'blue',
            Icon: IconRepeat,
        },
    ]

    return (
        <section
            data-testid={TEST_ID}
            aria-label="Progress summary"
            className="min-w-0 rounded-[var(--radius-surface)] border border-ink/10 bg-muted p-1.5"
        >
            <div className="space-y-5 rounded-[var(--radius-surface-inner)] bg-card p-4 md:p-5">
                <header className="space-y-1">
                    <h2 className="display text-xl">Progress summary</h2>
                    <p
                        data-testid={`${TEST_ID}-takeaway`}
                        className="text-sm text-muted-foreground"
                    >
                        {takeaway}
                    </p>
                </header>

                {segments.length === 0 ? null : (
                    <div
                        data-testid={`${TEST_ID}-bar`}
                        role="img"
                        aria-label={takeaway}
                        className="flex gap-1 rounded-full bg-muted p-1"
                    >
                        {segments.map((verdict, index) => (
                            <span
                                key={index}
                                data-tone={SEGMENT_TONES[verdict]}
                                style={{ animationDelay: `${index * 45}ms` }}
                                className="h-3 min-w-1 flex-1 rounded-full bg-tone animate-in fade-in zoom-in-90 fill-mode-both duration-500 motion-reduce:animate-none"
                            />
                        ))}
                    </div>
                )}

                <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:grid-cols-4">
                    {tiles.map((tile) => (
                        <div
                            key={tile.id}
                            data-tone={tile.tone}
                            className="min-w-0 space-y-2 rounded-[var(--radius-surface-inner)] bg-tone-soft p-3 text-tone-deep"
                        >
                            <dt className="flex items-center gap-2">
                                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-tone text-tone-ink">
                                    <tile.Icon className="size-4" aria-hidden="true" />
                                </span>
                                <span className="eyebrow">{tile.label}</span>
                            </dt>
                            <dd
                                data-testid={`${TEST_ID}-${tile.id}`}
                                className="display text-2xl tabular-nums md:text-3xl"
                            >
                                {tile.value}
                            </dd>
                            {tile.hint === undefined ? null : (
                                <p className="text-xs leading-snug opacity-80 [overflow-wrap:anywhere]">
                                    {tile.hint}
                                </p>
                            )}
                        </div>
                    ))}
                </dl>

                {summary.bestGain === null && summary.slipping.length === 0 ? null : (
                    <ul className="grid gap-2 sm:grid-cols-2">
                        {summary.bestGain === null ? null : (
                            <li
                                data-testid={`${TEST_ID}-best-gain`}
                                data-tone="green"
                                className={cn(
                                    'flex items-start gap-2 rounded-[var(--radius-surface-inner)] border border-tone/30 bg-card px-3 py-2.5 text-sm text-tone-deep'
                                )}
                            >
                                <IconTrendingUp
                                    className="mt-0.5 size-4 shrink-0"
                                    aria-hidden="true"
                                />
                                <span className="min-w-0 [overflow-wrap:anywhere]">
                                    Biggest gain: {summary.bestGain.name},{' '}
                                    {formatKg(summary.bestGain.loadDeltaKg)} more weight.
                                </span>
                            </li>
                        )}
                        {summary.slipping.length === 0 ? null : (
                            <li
                                data-testid={`${TEST_ID}-slipping`}
                                data-tone="tangerine"
                                className="flex items-start gap-2 rounded-[var(--radius-surface-inner)] border border-tone/30 bg-card px-3 py-2.5 text-sm text-tone-deep"
                            >
                                <IconTrendingDown
                                    className="mt-0.5 size-4 shrink-0"
                                    aria-hidden="true"
                                />
                                <span className="min-w-0 [overflow-wrap:anywhere]">
                                    Slipping: {summary.slipping.join(', ')}.
                                </span>
                            </li>
                        )}
                    </ul>
                )}
            </div>
        </section>
    )
}
