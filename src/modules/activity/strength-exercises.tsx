import Image from 'next/image'
import { IconArrowDownRight, IconArrowUpRight, IconBarbell, IconTrophy } from '@tabler/icons-react'
import { exerciseKeyOf, summarizeExercise } from '@/_bff/core/helpers/strength-detail.helper'
import type { ExerciseComparisonDTO, StrengthSetDTO } from '@/_bff/modules/training/types'
import { shortDateLabel } from '@/modules/calendar/date-utils'
import { KINDS } from '@/modules/calendar/kinds'
import { InfoTip } from '@/components/ui/info-tip'
import {
    E1RM_HINT,
    formatStrengthNumber,
    lyftaRecordTypesOf,
    RECORD_LABELS,
    type RecordEntry,
} from '@/modules/activity/strength-utils'

type Props = {
    strengthSets: StrengthSetDTO[]
    // Earlier-session comparison per exercise; empty when there is no history to compare with.
    comparisons?: ExerciseComparisonDTO[]
    // The exercises that set records in this workout (see `findRecords`).
    records?: RecordEntry[]
}

type StrengthExerciseGroup = {
    key: string
    exercise: string
    exerciseIndex: number | null
    exerciseImageUrl: string | null
    sets: StrengthSetDTO[]
}

type DeltaProps = {
    testId: string
    delta: number
    unit: string
}

const DASH = '-'

function groupStrengthSets(sets: StrengthSetDTO[]): StrengthExerciseGroup[] {
    const groups = new Map<string, StrengthExerciseGroup>()

    for (const set of sets) {
        const key =
            set.exerciseIndex !== null
                ? `order:${set.exerciseIndex}`
                : set.sourceExerciseId === null
                  ? `name:${set.exercise.toLowerCase()}`
                  : `source:${set.sourceExerciseId}`
        const group = groups.get(key)

        if (group) {
            group.sets.push(set)
            if (group.exerciseImageUrl === null) {
                group.exerciseImageUrl = set.exerciseImageUrl
            }
        } else {
            groups.set(key, {
                key,
                exercise: set.exercise,
                exerciseIndex: set.exerciseIndex,
                exerciseImageUrl: set.exerciseImageUrl,
                sets: [set],
            })
        }
    }

    return [...groups.values()]
        .map((group) => ({
            ...group,
            sets: group.sets.toSorted((a, b) => a.setIndex - b.setIndex),
        }))
        .toSorted((a, b) => {
            if (a.exerciseIndex === null) {
                return b.exerciseIndex === null ? a.exercise.localeCompare(b.exercise) : 1
            }
            if (b.exerciseIndex === null) return -1
            return a.exerciseIndex - b.exerciseIndex
        })
}

const volumeOf = (set: StrengthSetDTO) =>
    set.reps !== null && set.reps >= 1 && set.loadKg !== null && set.loadKg > 0
        ? set.reps * set.loadKg
        : null

// A signed change with an arrow and text, never color alone.
function Delta({ testId, delta, unit }: DeltaProps) {
    const Icon = delta > 0 ? IconArrowUpRight : IconArrowDownRight

    return (
        <span
            data-testid={testId}
            className="inline-flex items-center gap-0.5 font-mono text-xs font-medium tabular-nums"
        >
            <Icon className="size-3.5" aria-hidden="true" />
            {delta > 0 ? '+' : '-'}
            {formatStrengthNumber(Math.abs(delta))} {unit}
        </span>
    )
}

export function StrengthExercises({ strengthSets, comparisons = [], records = [] }: Props) {
    const exerciseGroups = groupStrengthSets(strengthSets)
    const hasRir = strengthSets.some((set) => set.rir !== null)
    const workoutVolumeKg = strengthSets.reduce((total, set) => total + (volumeOf(set) ?? 0), 0)
    const { tone } = KINDS.strength

    return (
        <section aria-label="Strength exercises" data-tone={tone} className="space-y-5">
            {exerciseGroups.length === 0 ? (
                <p data-testid="strength-sets-empty" className="text-sm text-muted-foreground">
                    No set data recorded for this strength workout.
                </p>
            ) : (
                <div data-testid="strength-exercises" className="space-y-5">
                    {exerciseGroups.map((group, groupIndex) => {
                        const position = groupIndex + 1
                        const summary = summarizeExercise(group.sets)
                        const first = group.sets[0]
                        const comparison =
                            first === undefined
                                ? undefined
                                : comparisons.find((entry) => entry.key === exerciseKeyOf(first))
                        const previous = comparison?.previous ?? null
                        const topDelta =
                            previous === null ||
                            previous.topSetKg === null ||
                            summary.topSetKg === null
                                ? null
                                : summary.topSetKg - previous.topSetKg
                        const volumeDelta =
                            previous === null || previous.volumeKg === 0 || summary.volumeKg === 0
                                ? null
                                : summary.volumeKg - previous.volumeKg
                        const recordKinds =
                            first === undefined
                                ? []
                                : (records.find((entry) => entry.key === exerciseKeyOf(first))
                                      ?.kinds ?? [])
                        const isRecord = recordKinds.length > 0
                        const sharePercent =
                            workoutVolumeKg > 0 && summary.volumeKg > 0
                                ? Math.round((summary.volumeKg / workoutVolumeKg) * 100)
                                : null
                        const topSetIndex =
                            summary.topSetKg === null
                                ? null
                                : group.sets.find(
                                      (set) =>
                                          set.loadKg === summary.topSetKg &&
                                          set.reps === summary.topSetReps
                                  )?.setIndex
                        const facts = [
                            summary.topSetKg === null
                                ? null
                                : {
                                      id: 'top',
                                      label: 'Top set',
                                      value: `${formatStrengthNumber(summary.topSetKg)} kg`,
                                      detail: ` x ${summary.topSetReps}`,
                                  },
                            summary.volumeKg === 0
                                ? null
                                : {
                                      id: 'volume',
                                      label: 'Volume',
                                      value: `${formatStrengthNumber(summary.volumeKg)} kg`,
                                      detail:
                                          sharePercent === null ? undefined : ` (${sharePercent}%)`,
                                  },
                            summary.e1rmKg === null
                                ? null
                                : {
                                      id: 'e1rm',
                                      label: 'Est. 1RM',
                                      value: `${formatStrengthNumber(summary.e1rmKg)} kg`,
                                      hint: E1RM_HINT,
                                  },
                        ].filter((fact) => fact !== null)

                        return (
                            <section
                                key={group.key}
                                aria-labelledby={`strength-exercise-${position}-name`}
                                className="space-y-2"
                            >
                                <header className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3 rounded-[var(--radius-surface-inner)] bg-muted p-3 sm:flex sm:min-h-24 sm:gap-5 sm:p-4">
                                    <div
                                        data-testid={`strength-exercise-${position}-image-frame`}
                                        className="relative size-18 shrink-0 overflow-hidden rounded-md border border-hairline bg-background sm:size-24"
                                    >
                                        {group.exerciseImageUrl ? (
                                            <Image
                                                data-testid={`strength-exercise-${position}-image`}
                                                src={group.exerciseImageUrl}
                                                alt={`${group.exercise} demonstration`}
                                                fill
                                                sizes="(min-width: 640px) 96px, 80px"
                                                className="object-contain p-1"
                                            />
                                        ) : (
                                            <IconBarbell
                                                data-testid={`strength-exercise-${position}-image-placeholder`}
                                                aria-hidden="true"
                                                className="absolute inset-0 m-auto size-8 text-muted-foreground"
                                            />
                                        )}
                                    </div>
                                    {/* On a phone the title sits beside the picture and the facts drop to their own row. */}
                                    <div className="contents sm:block sm:min-w-0 sm:space-y-2">
                                        <h3
                                            id={`strength-exercise-${position}-name`}
                                            data-testid={`strength-exercise-${position}-name`}
                                            className="min-w-0 text-lg font-semibold leading-snug sm:text-xl"
                                        >
                                            {group.exercise}
                                        </h3>
                                        {facts.length > 0 && (
                                            <dl className="col-span-2 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-x-5 sm:gap-y-1">
                                                {facts.map((fact) => (
                                                    <div
                                                        key={fact.id}
                                                        className="min-w-0 rounded-lg bg-card p-2.5 sm:rounded-none sm:bg-transparent sm:p-0"
                                                    >
                                                        <dt className="eyebrow flex items-center gap-1.5 text-muted-foreground">
                                                            {fact.label}
                                                            {fact.hint !== undefined && (
                                                                <InfoTip
                                                                    label={fact.label}
                                                                    testId={`strength-exercise-${position}-${fact.id}-info`}
                                                                >
                                                                    {fact.hint}
                                                                </InfoTip>
                                                            )}
                                                        </dt>
                                                        <dd
                                                            data-testid={`strength-exercise-${position}-${fact.id}`}
                                                            className="font-mono text-sm tabular-nums"
                                                        >
                                                            {fact.value}
                                                            {fact.detail !== undefined && (
                                                                <span className="block text-xs text-muted-foreground sm:inline sm:text-sm sm:text-foreground">
                                                                    {fact.detail}
                                                                </span>
                                                            )}
                                                        </dd>
                                                    </div>
                                                ))}
                                            </dl>
                                        )}
                                    </div>
                                </header>

                                {(previous !== null || isRecord) && (
                                    <p
                                        data-testid={`strength-exercise-${position}-compare`}
                                        className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-xs text-muted-foreground sm:px-4"
                                    >
                                        {isRecord && (
                                            <span
                                                data-testid={`strength-exercise-${position}-record`}
                                                className="inline-flex items-center gap-1 rounded-full bg-tone-soft px-2 py-0.5 font-medium text-tone-deep"
                                            >
                                                <IconTrophy
                                                    className="size-3.5"
                                                    aria-hidden="true"
                                                />
                                                Record:{' '}
                                                {recordKinds
                                                    .map((kind) => RECORD_LABELS[kind.type])
                                                    .join(', ')}
                                            </span>
                                        )}
                                        {previous !== null && (
                                            <>
                                                <span>
                                                    Last time {shortDateLabel(previous.localDate)}
                                                </span>
                                                {topDelta !== null && topDelta !== 0 && (
                                                    <span className="inline-flex items-center gap-1">
                                                        Top set
                                                        <Delta
                                                            testId={`strength-exercise-${position}-top-delta`}
                                                            delta={topDelta}
                                                            unit="kg"
                                                        />
                                                    </span>
                                                )}
                                                {volumeDelta !== null && volumeDelta !== 0 && (
                                                    <span className="inline-flex items-center gap-1">
                                                        Volume
                                                        <Delta
                                                            testId={`strength-exercise-${position}-volume-delta`}
                                                            delta={volumeDelta}
                                                            unit="kg"
                                                        />
                                                    </span>
                                                )}
                                            </>
                                        )}
                                    </p>
                                )}

                                <ol className="grid gap-1">
                                    {group.sets.map((set) => {
                                        const setVolume = volumeOf(set)
                                        const barScale =
                                            set.loadKg !== null &&
                                            set.loadKg > 0 &&
                                            summary.topSetKg !== null
                                                ? Math.min(1, set.loadKg / summary.topSetKg)
                                                : 0

                                        return (
                                            <li
                                                key={set.setIndex}
                                                className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-baseline gap-3 px-2 py-1.5 sm:px-4"
                                            >
                                                <span
                                                    data-testid={`strength-exercise-${position}-set-${set.setIndex}-index`}
                                                    className="font-semibold tabular-nums"
                                                >
                                                    {set.setIndex}
                                                </span>
                                                <div className="min-w-0 space-y-1.5">
                                                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                                        <p className="font-mono text-base sm:text-lg">
                                                            <span
                                                                data-testid={`strength-exercise-${position}-set-${set.setIndex}-load`}
                                                            >
                                                                {set.loadKg === null
                                                                    ? DASH
                                                                    : `${formatStrengthNumber(set.loadKg)} kg`}
                                                            </span>{' '}
                                                            x{' '}
                                                            <span
                                                                data-testid={`strength-exercise-${position}-set-${set.setIndex}-reps`}
                                                            >
                                                                {set.reps ?? DASH} reps
                                                            </span>
                                                        </p>
                                                        {hasRir && (
                                                            <span
                                                                data-testid={`strength-exercise-${position}-set-${set.setIndex}-rir`}
                                                                className="text-sm text-muted-foreground"
                                                            >
                                                                RIR {set.rir ?? DASH}
                                                            </span>
                                                        )}
                                                        {topSetIndex === set.setIndex && (
                                                            <span
                                                                data-testid={`strength-exercise-${position}-set-${set.setIndex}-top`}
                                                                className="rounded-full bg-tone-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-tone-deep"
                                                            >
                                                                Top set
                                                            </span>
                                                        )}
                                                        {lyftaRecordTypesOf(set).length > 0 && (
                                                            <span
                                                                data-testid={`strength-exercise-${position}-set-${set.setIndex}-record`}
                                                                className="inline-flex items-center gap-1 rounded-full bg-tone-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-tone-deep"
                                                            >
                                                                <IconTrophy
                                                                    className="size-3"
                                                                    aria-hidden="true"
                                                                />
                                                                {lyftaRecordTypesOf(set)
                                                                    .map(
                                                                        (type) =>
                                                                            RECORD_LABELS[type]
                                                                    )
                                                                    .join(', ')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {barScale > 0 && (
                                                        <div
                                                            aria-hidden="true"
                                                            className="h-1 overflow-hidden rounded-full bg-tone-soft"
                                                        >
                                                            <div
                                                                data-testid={`strength-exercise-${position}-set-${set.setIndex}-bar`}
                                                                className="h-full w-full origin-left rounded-full bg-tone"
                                                                style={{
                                                                    transform: `scaleX(${barScale})`,
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                                <span
                                                    data-testid={`strength-exercise-${position}-set-${set.setIndex}-volume`}
                                                    className="font-mono text-sm tabular-nums text-muted-foreground"
                                                >
                                                    {setVolume === null
                                                        ? DASH
                                                        : `${formatStrengthNumber(setVolume)} kg`}
                                                </span>
                                            </li>
                                        )
                                    })}
                                </ol>
                            </section>
                        )
                    })}
                </div>
            )}
        </section>
    )
}
