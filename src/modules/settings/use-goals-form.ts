import { useForm, type Resolver } from 'react-hook-form'
import { z } from 'zod'
import { WEEKLY_GOAL_LIMITS, type WeeklyGoals } from '@/_bff/core/constants/weekly-goals.constants'
import { formatClock, parseClock } from '@/_bff/core/utils/formatters.utils'

// What the inputs hold: every field is a string, "no goal" is an empty string.
export type GoalsFormValues = {
    weeklyRunKm: string
    longRunsPerWeek: string
    fastRunsPerWeek: string
    strengthSessionsPerWeek: string
    shortRunMaxKm: string
    longRunMinKm: string
    fastPace: string
}

type GoalsErrors = Partial<Record<keyof GoalsFormValues, string>>

type ParseResult = { success: true; values: WeeklyGoals } | { success: false; errors: GoalsErrors }

const FIELDS = [
    'weeklyRunKm',
    'longRunsPerWeek',
    'fastRunsPerWeek',
    'strengthSessionsPerWeek',
    'shortRunMaxKm',
    'longRunMinKm',
    'fastPace',
] as const

const L = WEEKLY_GOAL_LIMITS

const toNumber = (raw: string, ctx: z.RefinementCtx, check: (value: number) => string | null) => {
    const value = Number(raw.trim())
    const message = raw.trim() !== '' && Number.isFinite(value) ? check(value) : 'Enter a number'
    if (message === null) return value
    ctx.addIssue({ code: 'custom', message })
    return z.NEVER
}

const optionalCount = (min: number, max: number) =>
    z
        .string()
        .transform((raw, ctx) =>
            raw.trim() === ''
                ? null
                : toNumber(raw, ctx, (value) =>
                      Number.isInteger(value) && value >= min && value <= max
                          ? null
                          : `Enter a whole number from ${min} to ${max}`
                  )
        )

const kmToMeters = (minM: number, maxM: number) => (raw: string, ctx: z.RefinementCtx) => {
    const km = toNumber(raw, ctx, (value) =>
        value * 1000 >= minM && value * 1000 <= maxM
            ? null
            : `Enter km from ${minM / 1000} to ${maxM / 1000}`
    )
    return Math.round(km * 1000)
}

const goalsSchema = z
    .object({
        weeklyRunKm: z
            .string()
            .transform((raw, ctx) =>
                raw.trim() === ''
                    ? null
                    : kmToMeters(L.weeklyRunDistanceMinM, L.weeklyRunDistanceMaxM)(raw, ctx)
            ),
        longRunsPerWeek: optionalCount(L.runsPerWeekMin, L.runsPerWeekMax),
        fastRunsPerWeek: optionalCount(L.runsPerWeekMin, L.runsPerWeekMax),
        strengthSessionsPerWeek: optionalCount(
            L.strengthSessionsPerWeekMin,
            L.strengthSessionsPerWeekMax
        ),
        // The lower bound is 1 m: the table only requires a positive short run distance.
        shortRunMaxKm: z.string().transform(kmToMeters(1, L.runTypeDistanceMaxM)),
        longRunMinKm: z.string().transform(kmToMeters(1, L.runTypeDistanceMaxM)),
        fastPace: z.string().transform((raw, ctx) => {
            const seconds = parseClock(raw)
            if (
                seconds !== null &&
                seconds >= L.fastPaceMinSPerKm &&
                seconds <= L.fastPaceMaxSPerKm
            )
                return seconds
            ctx.addIssue({
                code: 'custom',
                message: `Enter a pace from ${formatClock(L.fastPaceMinSPerKm)} to ${formatClock(L.fastPaceMaxSPerKm)} (m:ss)`,
            })
            return z.NEVER
        }),
    })
    .superRefine((value, ctx) => {
        if (value.shortRunMaxKm >= value.longRunMinKm)
            ctx.addIssue({
                code: 'custom',
                path: ['shortRunMaxKm'],
                message: 'Short run must be below long run',
            })
    })

// Validates and converts the raw form values; errors hold the first message per field.
export const parseGoalsValues = (raw: GoalsFormValues): ParseResult => {
    const parsed = goalsSchema.safeParse(raw)
    if (parsed.success) {
        const data = parsed.data
        return {
            success: true,
            values: {
                weeklyRunDistanceM: data.weeklyRunKm,
                longRunsPerWeek: data.longRunsPerWeek,
                fastRunsPerWeek: data.fastRunsPerWeek,
                strengthSessionsPerWeek: data.strengthSessionsPerWeek,
                runTypeRules: {
                    shortRunMaxM: data.shortRunMaxKm,
                    longRunMinM: data.longRunMinKm,
                    fastPaceSPerKm: data.fastPace,
                },
            },
        }
    }
    const errors: GoalsErrors = {}
    for (const field of FIELDS) {
        const issue = parsed.error.issues.find((item) => item.path[0] === field)
        if (issue) errors[field] = issue.message
    }
    return { success: false, errors }
}

const toText = (value: number | null) => (value === null ? '' : String(value))

const metersToKm = (meters: number | null) => (meters === null ? '' : String(meters / 1000))

export const toGoalsFormValues = (goals: WeeklyGoals): GoalsFormValues => ({
    weeklyRunKm: metersToKm(goals.weeklyRunDistanceM),
    longRunsPerWeek: toText(goals.longRunsPerWeek),
    fastRunsPerWeek: toText(goals.fastRunsPerWeek),
    strengthSessionsPerWeek: toText(goals.strengthSessionsPerWeek),
    shortRunMaxKm: metersToKm(goals.runTypeRules.shortRunMaxM),
    longRunMinKm: metersToKm(goals.runTypeRules.longRunMinM),
    fastPace: formatClock(goals.runTypeRules.fastPaceSPerKm) ?? '',
})

// Same pattern as `useProfileForm`: the form holds the raw strings and the schema runs through
// this resolver; `parseGoalsValues` converts them on submit.
const goalsResolver: Resolver<GoalsFormValues> = (values) => {
    const result = parseGoalsValues(values)
    if (result.success) return { values, errors: {} }
    const errors = Object.fromEntries(
        Object.entries(result.errors).map(([field, message]) => [
            field,
            { type: 'validation', message },
        ])
    )
    return { values: {}, errors }
}

export const useGoalsForm = (defaults: GoalsFormValues) =>
    useForm<GoalsFormValues>({ resolver: goalsResolver, defaultValues: defaults })
