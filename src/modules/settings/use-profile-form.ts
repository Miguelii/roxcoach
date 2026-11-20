import { useForm, type Resolver } from 'react-hook-form'
import { z } from 'zod'
import { PROFILE_LIMITS } from '@/_bff/core/constants/athlete.constants'
import { HYROX_DIVISION_KEYS } from '@/_bff/core/constants/hyrox.constants'

type ParseResult =
    | { success: true; values: ProfileValues }
    | { success: false; errors: Partial<Record<keyof ProfileFormValues, string>> }

// Empty string means "not set" and becomes null; anything else must pass `check`.
const optionalNumber = (check: (value: number) => string | null) =>
    z.string().transform((raw, ctx) => {
        const text = raw.trim()
        if (text === '') return null
        const value = Number(text)
        const message = Number.isFinite(value) ? check(value) : 'Enter a number'
        if (message === null) return value
        ctx.addIssue({ code: 'custom', message })
        return z.NEVER
    })

const heartRate = (min: number, max: number) =>
    optionalNumber((value) =>
        Number.isInteger(value) && value >= min && value <= max
            ? null
            : `Enter a whole number from ${min} to ${max}`
    )

const FIELDS = [
    'displayName',
    'timezone',
    'maxHr',
    'restingHr',
    'hyroxDivision',
    'weeklyHoursCap',
    'notes',
] as const

const profileSchema = z
    .object({
        displayName: z
            .string()
            .trim()
            .min(1, 'Enter your name')
            .max(
                PROFILE_LIMITS.nameMaxLength,
                `Use at most ${PROFILE_LIMITS.nameMaxLength} characters`
            ),
        timezone: z.string().min(1, 'Choose a timezone'),
        maxHr: heartRate(PROFILE_LIMITS.minMaxHr, PROFILE_LIMITS.maxMaxHr),
        restingHr: heartRate(PROFILE_LIMITS.minRestingHr, PROFILE_LIMITS.maxRestingHr),
        hyroxDivision: z
            .union([z.literal(''), z.enum(HYROX_DIVISION_KEYS)])
            .transform((value) => (value === '' ? null : value)),
        weeklyHoursCap: optionalNumber((value) =>
            value > 0 && value <= PROFILE_LIMITS.weeklyHoursCapMax
                ? null
                : `Enter hours above 0 and up to ${PROFILE_LIMITS.weeklyHoursCapMax}`
        ),
        notes: z
            .string()
            .max(
                PROFILE_LIMITS.notesMaxLength,
                `Use at most ${PROFILE_LIMITS.notesMaxLength} characters`
            )
            .transform((value) => (value.trim() === '' ? null : value)),
    })
    .superRefine((value, ctx) => {
        if (value.maxHr !== null && value.restingHr !== null && value.restingHr >= value.maxHr)
            ctx.addIssue({
                code: 'custom',
                path: ['restingHr'],
                message: 'Resting heart rate must be below max heart rate',
            })
    })

// What the inputs hold: numbers are strings, "not set" is an empty string.
export type ProfileFormValues = z.input<typeof profileSchema>

// What the server receives: numbers are numbers, "not set" is null.
export type ProfileValues = z.output<typeof profileSchema>

// Validates and converts the raw form values; errors hold the first message per field.
export const parseProfileValues = (raw: ProfileFormValues): ParseResult => {
    const parsed = profileSchema.safeParse(raw)
    if (parsed.success) return { success: true, values: parsed.data }
    const errors: Partial<Record<keyof ProfileFormValues, string>> = {}
    for (const field of FIELDS) {
        const issue = parsed.error.issues.find((item) => item.path[0] === field)
        if (issue) errors[field] = issue.message
    }
    return { success: false, errors }
}

// The shadcn FormField does not carry a transformed type, so the form holds the raw values and
// the schema runs through this resolver; `parseProfileValues` converts them on submit.
const profileResolver: Resolver<ProfileFormValues> = (values) => {
    const result = parseProfileValues(values)
    if (result.success) return { values, errors: {} }
    const errors = Object.fromEntries(
        Object.entries(result.errors).map(([field, message]) => [
            field,
            { type: 'validation', message },
        ])
    )
    return { values: {}, errors }
}

export const useProfileForm = (defaults: ProfileFormValues) =>
    useForm<ProfileFormValues>({ resolver: profileResolver, defaultValues: defaults })
