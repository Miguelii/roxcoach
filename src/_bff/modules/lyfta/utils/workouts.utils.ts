import { z } from 'zod'
import type {
    LyftaCompletedSet,
    LyftaExercise,
    LyftaSetRecord,
    LyftaWorkout,
    LyftaWorkoutPage,
    ParseResult,
} from '@/_bff/modules/lyfta/types'

type LyftaJsonValue =
    | null
    | boolean
    | number
    | string
    | LyftaJsonValue[]
    | { [key: string]: LyftaJsonValue }

type RawExercise = z.output<typeof rawExerciseSchema>
type RawSet = z.output<typeof rawSetSchema>
type RawWorkout = z.output<typeof rawWorkoutSchema>
type WeightUnit = z.output<typeof weightUnitSchema>

const numericId = z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/u)])
const POUNDS_TO_KILOGRAMS = 0.45359237

const optionalIntegerSchema = z
    .union([
        z.number().int(),
        z
            .string()
            .trim()
            .length(0)
            .transform(() => null),
        z
            .string()
            .trim()
            .regex(/^-?\d+$/u)
            .transform(Number)
            .pipe(z.number().int()),
        z.null().transform(() => null),
    ])
    .optional()
    .transform((value) => value ?? null)
    .refine((value) => value === null || value >= 0)

const optionalWeightSchema = z
    .union([
        z.number(),
        z
            .string()
            .trim()
            .length(0)
            .transform(() => null),
        z
            .string()
            .trim()
            .regex(/^-?\d+(?:\.\d+)?$/u)
            .transform(Number)
            .pipe(z.number()),
        z.null().transform(() => null),
    ])
    .optional()
    .transform((value) => value ?? null)
    .refine((value) => value === null || value >= 0)

const optionalRirSchema = optionalIntegerSchema

function isLyftaExerciseImageUrl(value: string): boolean {
    const url = new URL(value)
    const isLyftaCatalogImage =
        url.hostname === 'lyfta.app' && url.pathname.startsWith('/images/exercises/')
    const isGymvisualImage =
        url.hostname === 'apilyfta.com' && url.pathname.startsWith('/static/GymvisualPNG/')

    return (
        url.protocol === 'https:' &&
        url.port === '' &&
        url.username === '' &&
        url.password === '' &&
        url.search === '' &&
        url.hash === '' &&
        (isLyftaCatalogImage || isGymvisualImage)
    )
}

const exerciseImageUrlSchema = z
    .url()
    .refine(isLyftaExerciseImageUrl)
    .nullable()
    .optional()
    .transform((value) => value ?? null)

const rawSetSchema = z.object({
    is_completed: z.boolean(),
    reps: z.custom<LyftaJsonValue>().optional(),
    weight: z.custom<LyftaJsonValue>().optional(),
    rir: z.custom<LyftaJsonValue>().optional(),
    // Set only on the set that broke a record: comma separated lists of the same length.
    record_type: z.custom<LyftaJsonValue>().optional(),
    record_level: z.custom<LyftaJsonValue>().optional(),
    record_value: z.custom<LyftaJsonValue>().optional(),
})

const rawExerciseSchema = z.object({
    exercise_id: numericId,
    excercise_name: z.string().trim().min(1),
    exercise_image: exerciseImageUrlSchema,
    sets: z.array(rawSetSchema),
})

const weightUnitSchema = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.enum(['kg', 'lb', 'lbs']))

const workoutDateSchema = z.union([
    z.iso.datetime({ offset: true }),
    z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u)
        .transform((value) => `${value.replace(' ', 'T')}Z`)
        .pipe(z.iso.datetime({ offset: true })),
])

const rawWorkoutSchema = z.object({
    id: numericId,
    title: z.string().trim().min(1),
    workout_perform_date: workoutDateSchema,
    workout_duration: z
        .union([z.string().regex(/^\d{2,}:[0-5]\d:[0-5]\d$/u), z.literal(''), z.null()])
        .optional(),
    weight_unit: weightUnitSchema
        .nullable()
        .optional()
        .transform((value) => value ?? undefined),
    body_weight: z.custom<LyftaJsonValue>().optional(),
    total_volume: z.custom<LyftaJsonValue>().optional(),
    exercises: z.array(rawExerciseSchema),
})

const rawPageSchema = z.object({
    status: z.literal(true),
    total_pages: z.number().int().nonnegative(),
    current_page: z.number().int().positive(),
    workouts: z.array(rawWorkoutSchema),
})

// "1,3" or 1 -> ['1', '3'] / ['1']; anything else (null, missing, an object) -> [].
const recordListSchema = z
    .union([z.string(), z.number().transform(String)])
    .transform((text) =>
        text
            .split(',')
            .map((part) => part.trim())
            .filter((part) => part.length > 0)
    )
    .catch([])

const splitList = (value: LyftaJsonValue | undefined): string[] => recordListSchema.parse(value)

const toNonNegativeNumber = (text: string | undefined): number | null => {
    if (text === undefined) return null
    const number = Number(text)
    return Number.isFinite(number) && number >= 0 ? number : null
}

// Records are extra information, never a reason to reject a workout: a malformed or unknown entry is
// dropped instead of failing validation.
function parseSetRecords(set: RawSet): LyftaSetRecord[] {
    const types = splitList(set.record_type)
    const levels = splitList(set.record_level)
    const values = splitList(set.record_value)
    const records: LyftaSetRecord[] = []

    for (const [index, rawType] of types.entries()) {
        const type = Number(rawType)
        if (!Number.isInteger(type) || type < 1) continue
        records.push({
            type,
            level: toNonNegativeNumber(levels[index]),
            value: toNonNegativeNumber(values[index]),
        })
    }
    return records
}

function parseCompletedSets(
    exercise: RawExercise,
    workoutIndex: number,
    exerciseIndex: number,
    weightUnit: WeightUnit | undefined,
    issues: string[]
): LyftaCompletedSet[] {
    const result: LyftaCompletedSet[] = []

    for (const [setIndex, set] of exercise.sets.entries()) {
        const reps = optionalIntegerSchema.safeParse(set.reps)
        const weight = optionalWeightSchema.safeParse(set.weight)
        const rir = optionalRirSchema.safeParse(set.rir)
        const basePath = `workouts.${workoutIndex}.exercises.${exerciseIndex}.sets.${setIndex}`

        // Some accounts log sets with reps and weight but Lyfta never marks them completed, so a
        // set is kept when it is completed or carries reps or weight. An incomplete set that is
        // empty or malformed is skipped quietly; only completed sets fail validation.
        if (!set.is_completed) {
            const hasValues =
                (reps.success && reps.data !== null) || (weight.success && weight.data !== null)
            if (!reps.success || !weight.success || !rir.success || !hasValues) continue
        }

        if (!reps.success) issues.push(`${basePath}.reps`)
        if (!weight.success) issues.push(`${basePath}.weight`)
        if (!rir.success) issues.push(`${basePath}.rir`)
        if (!reps.success || !weight.success || !rir.success) continue

        let loadKg: number | null = null
        if (weight.data !== null) {
            if (weightUnit === undefined) {
                issues.push(`workouts.${workoutIndex}.weight_unit`)
                continue
            }
            loadKg = toKilograms(weight.data, weightUnit)
        }

        const records = parseSetRecords(set)
        result.push({
            setIndex: setIndex + 1,
            reps: reps.data,
            loadKg,
            rir: rir.data,
            ...(records.length > 0 && { records }),
        })
    }

    return result
}

function parseWorkout(raw: RawWorkout, index: number, issues: string[]): LyftaWorkout {
    const bodyWeight = optionalWeightSchema.safeParse(raw.body_weight)
    const totalVolume = optionalWeightSchema.safeParse(raw.total_volume)
    if (!bodyWeight.success) issues.push(`workouts.${index}.body_weight`)
    if (!totalVolume.success) issues.push(`workouts.${index}.total_volume`)

    if (
        raw.weight_unit === undefined &&
        ((bodyWeight.success && bodyWeight.data !== null) ||
            (totalVolume.success && totalVolume.data !== null))
    ) {
        issues.push(`workouts.${index}.weight_unit`)
    }

    const exercises: LyftaExercise[] = raw.exercises.map((exercise, exerciseIndex) => ({
        exerciseId: String(exercise.exercise_id),
        name: exercise.excercise_name,
        imageUrl: exercise.exercise_image,
        sets: parseCompletedSets(exercise, index, exerciseIndex, raw.weight_unit, issues),
    }))

    return {
        sourceId: String(raw.id),
        title: raw.title,
        startedAt: new Date(raw.workout_perform_date).toISOString(),
        durationSeconds: parseWorkoutDuration(raw.workout_duration),
        bodyWeightKg:
            bodyWeight.success && bodyWeight.data !== null && raw.weight_unit !== undefined
                ? toKilograms(bodyWeight.data, raw.weight_unit)
                : null,
        totalVolumeKgReps:
            totalVolume.success && totalVolume.data !== null && raw.weight_unit !== undefined
                ? toKilograms(totalVolume.data, raw.weight_unit)
                : null,
        exercises,
    }
}

function toKilograms(value: number, unit: WeightUnit): number {
    if (unit === 'kg') return value
    return Number((value * POUNDS_TO_KILOGRAMS).toFixed(3))
}

function parseWorkoutDuration(value: RawWorkout['workout_duration']): number | null {
    if (value === undefined || value === null || value === '') return null
    const [hours, minutes, seconds] = value.split(':').map(Number)
    return hours * 3600 + minutes * 60 + seconds
}

export function parseLyftaWorkoutPage(
    input: LyftaJsonValue,
    requestedPage: number
): ParseResult<LyftaWorkoutPage> {
    const parsed = rawPageSchema.safeParse(input)
    if (!parsed.success) {
        return {
            success: false,
            issues: parsed.error.issues.map((issue) => issue.path.join('.')),
        }
    }

    if (
        !Number.isSafeInteger(requestedPage) ||
        requestedPage < 1 ||
        parsed.data.current_page !== requestedPage ||
        (parsed.data.total_pages > 0 && requestedPage > parsed.data.total_pages) ||
        (parsed.data.total_pages === 0 && parsed.data.workouts.length > 0)
    ) {
        return { success: false, issues: ['pagination'] }
    }

    const issues: string[] = []
    const workouts = parsed.data.workouts.map((workout, index) =>
        parseWorkout(workout, index, issues)
    )
    const sourceIds = new Set<string>()
    for (const [index, workout] of workouts.entries()) {
        if (sourceIds.has(workout.sourceId)) issues.push(`workouts.${index}.id`)
        sourceIds.add(workout.sourceId)
    }
    if (issues.length > 0) return { success: false, issues: [...new Set(issues)] }

    return {
        success: true,
        data: {
            currentPage: parsed.data.current_page,
            totalPages: parsed.data.total_pages,
            workouts,
        },
    }
}
