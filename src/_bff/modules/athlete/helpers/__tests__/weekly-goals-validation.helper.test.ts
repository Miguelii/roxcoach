import { describe, expect, it } from 'vitest'
import {
    DEFAULT_WEEKLY_GOALS,
    type RunTypeRules,
    type WeeklyGoals,
} from '@/_bff/core/constants/weekly-goals.constants'
import { validateWeeklyGoals } from '@/_bff/modules/athlete/helpers/weekly-goals-validation.helper'

const VALID: WeeklyGoals = {
    weeklyRunDistanceM: 30000,
    longRunsPerWeek: 1,
    fastRunsPerWeek: 2,
    strengthSessionsPerWeek: 3,
    runTypeRules: { shortRunMaxM: 3000, longRunMinM: 6000, fastPaceSPerKm: 300 },
}

const fieldOf = (patch: Partial<WeeklyGoals>, rules: Partial<RunTypeRules> = {}) => {
    const result = validateWeeklyGoals({
        ...VALID,
        ...patch,
        runTypeRules: { ...VALID.runTypeRules, ...rules },
    })
    return result.ok ? null : result.field
}

describe('validateWeeklyGoals', () => {
    it('accepts a full valid input', () => {
        expect(validateWeeklyGoals(VALID)).toEqual({ ok: true })
    })

    it('accepts every goal null with the default rules', () => {
        expect(validateWeeklyGoals(DEFAULT_WEEKLY_GOALS)).toEqual({ ok: true })
    })

    it.each<[string, Partial<WeeklyGoals>, Partial<RunTypeRules>]>([
        ['weeklyRunDistanceM', { weeklyRunDistanceM: 999 }, {}],
        ['weeklyRunDistanceM', { weeklyRunDistanceM: 500001 }, {}],
        ['longRunsPerWeek', { longRunsPerWeek: 0 }, {}],
        ['longRunsPerWeek', { longRunsPerWeek: 8 }, {}],
        ['fastRunsPerWeek', { fastRunsPerWeek: 0 }, {}],
        ['fastRunsPerWeek', { fastRunsPerWeek: 8 }, {}],
        ['fastRunsPerWeek', { fastRunsPerWeek: 1.5 }, {}],
        ['strengthSessionsPerWeek', { strengthSessionsPerWeek: 0 }, {}],
        ['strengthSessionsPerWeek', { strengthSessionsPerWeek: 15 }, {}],
        ['shortRunMaxM', {}, { shortRunMaxM: 0 }],
        ['shortRunMaxM', {}, { shortRunMaxM: 6000 }],
        ['longRunMinM', {}, { longRunMinM: 100001 }],
        ['fastPaceSPerKm', {}, { fastPaceSPerKm: 119 }],
        ['fastPaceSPerKm', {}, { fastPaceSPerKm: 601 }],
    ])('rejects %s', (field, patch, rules) => {
        expect(fieldOf(patch, rules)).toBe(field)
    })
})
