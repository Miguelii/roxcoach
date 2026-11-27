export type RunType = (typeof RUN_TYPES)[number]
export type RunTypeRules = { shortRunMaxM: number; longRunMinM: number; fastPaceSPerKm: number }
export type WeeklyGoals = {
    weeklyRunDistanceM: number | null
    longRunsPerWeek: number | null
    fastRunsPerWeek: number | null
    strengthSessionsPerWeek: number | null
    runTypeRules: RunTypeRules
}

export const RUN_TYPES = ['long', 'fast'] as const

export const DEFAULT_RUN_TYPE_RULES: RunTypeRules = {
    shortRunMaxM: 3000,
    longRunMinM: 6000,
    fastPaceSPerKm: 300,
}

export const DEFAULT_WEEKLY_GOALS: WeeklyGoals = {
    weeklyRunDistanceM: null,
    longRunsPerWeek: null,
    fastRunsPerWeek: null,
    strengthSessionsPerWeek: null,
    runTypeRules: DEFAULT_RUN_TYPE_RULES,
}

// Mirrors the checks on roxcoach.weekly_goals (migration 0025).
export const WEEKLY_GOAL_LIMITS = {
    runTypeDistanceMaxM: 100000,
    fastPaceMinSPerKm: 120,
    fastPaceMaxSPerKm: 600,
    weeklyRunDistanceMinM: 1000,
    weeklyRunDistanceMaxM: 500000,
    runsPerWeekMin: 1,
    runsPerWeekMax: 7,
    strengthSessionsPerWeekMin: 1,
    strengthSessionsPerWeekMax: 14,
} as const
