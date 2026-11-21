import {
    exerciseKeyOf,
    summarizeExercise,
    type ExerciseSummary,
} from '@/_bff/core/helpers/strength-detail.helper'
import type {
    ActivityDTO,
    ExerciseComparisonDTO,
    StrengthSetDTO,
} from '@/_bff/modules/training/types'

export type RecordType = 'weight' | 'e1rm' | 'set-volume' | 'volume'

type RecordKind = {
    type: RecordType
    // The record value in kg (a 1RM or a volume, for those types).
    valueKg: number
    // The set that did it, like `70 kg x 5`, when known.
    setText: string | null
    // Gain over the previous best; null when the source does not say.
    deltaKg: number | null
}

export type RecordEntry = {
    key: string
    exercise: string
    kinds: RecordKind[]
}

type RecordsInput = {
    source: ActivityDTO['source']
    strengthSets: StrengthSetDTO[]
    comparisons: ExerciseComparisonDTO[]
}

const STRENGTH_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
})

export const DENSITY_HINT =
    'Total volume divided by the workout time. Higher means more work packed into each minute.'

export const RECORD_LABELS: Record<RecordType, string> = {
    weight: 'Weight',
    e1rm: '1RM',
    'set-volume': 'Set volume',
    volume: 'Volume',
}

// Lyfta's `record_type`: 1 is the estimated 1RM and 3 the volume of one set (checked against real
// payloads). Type 2 has not been seen yet, so it is ignored instead of guessed.
const LYFTA_RECORD_TYPES = new Map<number, RecordType>([
    [1, 'e1rm'],
    [3, 'set-volume'],
])

// Kilograms, volumes and reps with at most two decimals and thousands separators.
export const formatStrengthNumber = (value: number) => STRENGTH_NUMBER_FORMATTER.format(value)

const setText = (set: StrengthSetDTO) =>
    set.loadKg === null || set.reps === null
        ? null
        : `${formatStrengthNumber(set.loadKg)} kg x ${set.reps}`

// The record types Lyfta flagged on one set, without repeats.
export function lyftaRecordTypesOf(set: StrengthSetDTO): RecordType[] {
    const types = set.lyftaRecords.flatMap((record) => {
        const type = LYFTA_RECORD_TYPES.get(record.type)
        return type === undefined ? [] : [type]
    })
    return [...new Set(types)]
}

// What Lyfta flagged on the sets of one exercise: the best value per type, with the set behind it.
function lyftaKinds(sets: StrengthSetDTO[]): RecordKind[] {
    const best = new Map<RecordType, RecordKind>()

    for (const set of sets) {
        for (const record of set.lyftaRecords) {
            const type = LYFTA_RECORD_TYPES.get(record.type)
            if (type === undefined || record.value === null) continue
            const current = best.get(type)
            if (current === undefined || record.value > current.valueKg) {
                best.set(type, {
                    type,
                    valueKg: record.value,
                    setText: setText(set),
                    deltaKg: null,
                })
            }
        }
    }
    return [...best.values()]
}

// Our own comparison for activities that do not come from Lyfta: each measure of this workout
// against the best of every earlier workout. A measure never seen before (null) is no record.
function computedKinds(
    summary: ExerciseSummary,
    comparison: ExerciseComparisonDTO | undefined
): RecordKind[] {
    if (comparison === undefined) return []
    const kinds: RecordKind[] = []
    const beat = (
        type: RecordType,
        value: number | null,
        best: number | null,
        text: string | null
    ) => {
        if (value === null || best === null || value <= best) return
        kinds.push({ type, valueKg: value, setText: text, deltaKg: value - best })
    }

    beat(
        'weight',
        summary.topSetKg,
        comparison.bestPriorTopSetKg,
        summary.topSetKg === null
            ? null
            : `${formatStrengthNumber(summary.topSetKg)} kg x ${summary.topSetReps}`
    )
    beat('e1rm', summary.e1rmKg, comparison.bestPriorE1rmKg, null)
    beat(
        'volume',
        summary.volumeKg > 0 ? summary.volumeKg : null,
        comparison.bestPriorVolumeKg,
        null
    )
    return kinds
}

// The records of the workout, one entry per exercise that set any, in workout order. A Lyfta
// activity uses the records Lyfta flagged (all-time, as the athlete sees them in Lyfta); any other
// activity uses our comparison with earlier workouts. A repeated exercise counts once.
export function findRecords({ source, strengthSets, comparisons }: RecordsInput): RecordEntry[] {
    const ordered = strengthSets.toSorted(
        (a, b) => (a.exerciseIndex ?? Infinity) - (b.exerciseIndex ?? Infinity)
    )
    const byKey = new Map<string, StrengthSetDTO[]>()
    for (const set of ordered) {
        const key = exerciseKeyOf(set)
        byKey.set(key, [...(byKey.get(key) ?? []), set])
    }

    const records: RecordEntry[] = []
    for (const [key, sets] of byKey) {
        const first = sets[0]
        if (first === undefined) continue
        const kinds =
            source === 'lyfta'
                ? lyftaKinds(sets)
                : computedKinds(
                      summarizeExercise(sets),
                      comparisons.find((entry) => entry.key === key)
                  )
        if (kinds.length > 0) records.push({ key, exercise: first.exercise, kinds })
    }
    return records
}

// Whether "no records" is a real answer: Lyfta knows the whole history, and our own comparison
// needs at least one earlier workout of an exercise.
export const recordsAreKnown = (
    source: ActivityDTO['source'],
    comparisons: ExerciseComparisonDTO[]
) => source === 'lyfta' || comparisons.some((entry) => entry.previous !== null)
