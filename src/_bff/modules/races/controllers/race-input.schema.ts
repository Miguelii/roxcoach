import { z } from 'zod'
import { HYROX_DIVISION_KEYS } from '@/_bff/core/constants/hyrox.constants'

// Same ranges as validateRace (which also checks the date against the athlete's today).
export const RACE_INPUT = z.object({
    name: z.string().trim().min(1).max(80),
    raceType: z.enum(['hyrox', 'running', 'other']),
    raceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    location: z.string().max(80).nullable(),
    distanceM: z.number().int().min(400).max(200000).nullable(),
    hyroxDivision: z.enum(HYROX_DIVISION_KEYS).nullable(),
    targetTimeS: z.number().int().min(60).max(86400),
    priority: z.enum(['A', 'B', 'C']),
    notes: z.string().max(500).nullable(),
})
