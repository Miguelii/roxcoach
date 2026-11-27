import {
    WEEKLY_GOAL_LIMITS as LIMITS,
    type RunTypeRules,
    type WeeklyGoals,
} from '@/_bff/core/constants/weekly-goals.constants'

type GoalField = keyof WeeklyGoals | keyof RunTypeRules
type ValidationResult = { ok: true } | { ok: false; field: GoalField }

const inRange = (value: number, min: number, max: number) =>
    Number.isInteger(value) && value >= min && value <= max

const optionalInRange = (value: number | null, min: number, max: number) =>
    value === null || inRange(value, min, max)

// Returns the first field out of range, or { ok: true }. Mirrors the checks of the weekly_goals table.
export const validateWeeklyGoals = (goals: WeeklyGoals): ValidationResult => {
    const { shortRunMaxM, longRunMinM, fastPaceSPerKm } = goals.runTypeRules
    const checks: Array<[GoalField, boolean]> = [
        [
            'weeklyRunDistanceM',
            optionalInRange(
                goals.weeklyRunDistanceM,
                LIMITS.weeklyRunDistanceMinM,
                LIMITS.weeklyRunDistanceMaxM
            ),
        ],
        [
            'longRunsPerWeek',
            optionalInRange(goals.longRunsPerWeek, LIMITS.runsPerWeekMin, LIMITS.runsPerWeekMax),
        ],
        [
            'fastRunsPerWeek',
            optionalInRange(goals.fastRunsPerWeek, LIMITS.runsPerWeekMin, LIMITS.runsPerWeekMax),
        ],
        [
            'strengthSessionsPerWeek',
            optionalInRange(
                goals.strengthSessionsPerWeek,
                LIMITS.strengthSessionsPerWeekMin,
                LIMITS.strengthSessionsPerWeekMax
            ),
        ],
        ['longRunMinM', inRange(longRunMinM, 2, LIMITS.runTypeDistanceMaxM)],
        ['shortRunMaxM', inRange(shortRunMaxM, 1, longRunMinM - 1)],
        [
            'fastPaceSPerKm',
            inRange(fastPaceSPerKm, LIMITS.fastPaceMinSPerKm, LIMITS.fastPaceMaxSPerKm),
        ],
    ]
    const failed = checks.find(([, valid]) => !valid)
    return failed ? { ok: false, field: failed[0] } : { ok: true }
}
