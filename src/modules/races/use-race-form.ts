import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { HYROX_DIVISION_KEYS, type HyroxDivision } from '@/_bff/core/constants/hyrox.constants'
import { formatClock } from '@/_bff/core/utils/formatters.utils'
import { parseRaceClock } from '@/modules/races/utils'
import type { RaceDTO, RaceInput } from '@/_bff/modules/races/types'

const RACE_TYPES = ['hyrox', 'running', 'other'] as const
const PRIORITIES = ['A', 'B', 'C'] as const

const MIN_GOAL_S = 60
const MAX_GOAL_S = 86400
const MIN_DISTANCE_KM = 0.4
const MAX_DISTANCE_KM = 200

// `today` is the athlete's local date. Inputs hold strings: the distance is in km and the goal time is `h:mm:ss`. An empty division
// means "not chosen".
export const createRaceSchema = (today: string) =>
    z
        .object({
            name: z.string().trim().min(1, 'Enter a name').max(80, 'Use at most 80 characters'),
            raceType: z.enum(RACE_TYPES),
            raceDate: z
                .string()
                .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Choose a date')
                .refine((value) => value > today, 'The date must be in the future'),
            location: z.string().max(80, 'Use at most 80 characters'),
            distanceKm: z.string(),
            hyroxDivision: z.union([z.literal(''), z.enum(HYROX_DIVISION_KEYS)]),
            targetTime: z.string(),
            priority: z.enum(PRIORITIES),
            notes: z.string().max(500, 'Use at most 500 characters'),
        })
        .superRefine((value, ctx) => {
            if (value.raceType === 'running') {
                const km = Number(value.distanceKm.trim())
                if (
                    value.distanceKm.trim() === '' ||
                    !Number.isFinite(km) ||
                    km < MIN_DISTANCE_KM ||
                    km > MAX_DISTANCE_KM
                )
                    ctx.addIssue({
                        code: 'custom',
                        path: ['distanceKm'],
                        message: `Enter a distance from ${MIN_DISTANCE_KM} to ${MAX_DISTANCE_KM} km`,
                    })
            }
            if (value.raceType === 'hyrox' && value.hyroxDivision === '')
                ctx.addIssue({
                    code: 'custom',
                    path: ['hyroxDivision'],
                    message: 'Choose a division',
                })
            const goal = parseRaceClock(value.targetTime)
            if (goal === null || goal < MIN_GOAL_S || goal > MAX_GOAL_S)
                ctx.addIssue({
                    code: 'custom',
                    path: ['targetTime'],
                    message: 'Enter a goal time such as 1:10:00 (1 minute to 24 hours)',
                })
        })

export type RaceFormValues = z.infer<ReturnType<typeof createRaceSchema>>

// Values for a new race; the division starts as the profile division.
export const emptyRaceFormValues = (defaultDivision: HyroxDivision | null): RaceFormValues => ({
    name: '',
    raceType: 'hyrox',
    raceDate: '',
    location: '',
    distanceKm: '',
    hyroxDivision: defaultDivision ?? '',
    targetTime: '',
    priority: 'A',
    notes: '',
})

// Inputs for editing an existing race.
export const raceToFormValues = (race: RaceDTO): RaceFormValues => ({
    name: race.name,
    raceType: race.raceType,
    raceDate: race.raceDate,
    location: race.location ?? '',
    distanceKm: race.distanceM === null ? '' : String(race.distanceM / 1000),
    hyroxDivision: race.hyroxDivision ?? '',
    targetTime: formatClock(race.targetTimeS) ?? '',
    priority: race.priority,
    notes: race.notes ?? '',
})

// Converts validated form values to the server input. The distance only goes with running and the
// division only with hyrox (the server rejects any other combination).
export const toRaceInput = (values: RaceFormValues): RaceInput => ({
    name: values.name.trim(),
    raceType: values.raceType,
    raceDate: values.raceDate,
    location: values.location.trim() === '' ? null : values.location.trim(),
    distanceM: values.raceType === 'running' ? Math.round(Number(values.distanceKm) * 1000) : null,
    hyroxDivision:
        values.raceType === 'hyrox' && values.hyroxDivision !== '' ? values.hyroxDivision : null,
    targetTimeS: parseRaceClock(values.targetTime) ?? 0,
    priority: values.priority,
    notes: values.notes.trim() === '' ? null : values.notes.trim(),
})

export const useRaceForm = (defaults: RaceFormValues, today: string) =>
    useForm<RaceFormValues>({
        resolver: zodResolver(createRaceSchema(today)),
        defaultValues: defaults,
    })
