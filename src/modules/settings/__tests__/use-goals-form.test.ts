import { describe, expect, it } from 'vitest'
import {
    DEFAULT_RUN_TYPE_RULES,
    type WeeklyGoals,
} from '@/_bff/core/constants/weekly-goals.constants'
import {
    parseGoalsValues,
    toGoalsFormValues,
    type GoalsFormValues,
} from '@/modules/settings/use-goals-form'

const RAW: GoalsFormValues = {
    weeklyRunKm: '12.5',
    longRunsPerWeek: '1',
    fastRunsPerWeek: '2',
    strengthSessionsPerWeek: '3',
    shortRunMaxKm: '3',
    longRunMinKm: '6',
    fastPace: '4:45',
}

describe('parseGoalsValues', () => {
    it('converts km to meters and m:ss to seconds', () => {
        expect(parseGoalsValues(RAW)).toEqual({
            success: true,
            values: {
                weeklyRunDistanceM: 12500,
                longRunsPerWeek: 1,
                fastRunsPerWeek: 2,
                strengthSessionsPerWeek: 3,
                runTypeRules: { shortRunMaxM: 3000, longRunMinM: 6000, fastPaceSPerKm: 285 },
            },
        })
    })

    it('turns empty goal fields into null', () => {
        const result = parseGoalsValues({
            ...RAW,
            weeklyRunKm: ' ',
            longRunsPerWeek: '',
            fastRunsPerWeek: '',
            strengthSessionsPerWeek: '',
        })
        expect(result.success && result.values).toMatchObject({
            weeklyRunDistanceM: null,
            longRunsPerWeek: null,
            fastRunsPerWeek: null,
            strengthSessionsPerWeek: null,
        })
    })

    it.each(['4:75', 'abc', '1:59', '10:01'])('rejects the pace %s', (fastPace) => {
        const result = parseGoalsValues({ ...RAW, fastPace })
        expect(result.success).toBe(false)
        if (!result.success) expect(result.errors.fastPace).toBeDefined()
    })

    it('rejects short run >= long run on shortRunMaxKm', () => {
        const result = parseGoalsValues({ ...RAW, shortRunMaxKm: '6' })
        expect(result.success).toBe(false)
        if (!result.success) expect(result.errors.shortRunMaxKm).toBeDefined()
    })

    it('round-trips toGoalsFormValues -> parseGoalsValues', () => {
        const goals: WeeklyGoals = {
            weeklyRunDistanceM: 30500,
            longRunsPerWeek: null,
            fastRunsPerWeek: 1,
            strengthSessionsPerWeek: 2,
            runTypeRules: DEFAULT_RUN_TYPE_RULES,
        }
        expect(parseGoalsValues(toGoalsFormValues(goals))).toEqual({ success: true, values: goals })
    })
})
