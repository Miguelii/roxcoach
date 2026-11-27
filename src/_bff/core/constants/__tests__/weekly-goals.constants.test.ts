import { describe, expect, it } from 'vitest'
import type { Database } from '@/_bff/core/db/database.types'
import {
    DEFAULT_RUN_TYPE_RULES,
    RUN_TYPES,
    WEEKLY_GOAL_LIMITS,
} from '@/_bff/core/constants/weekly-goals.constants'

const DB_RUN_TYPES: ReadonlyArray<Database['roxcoach']['Enums']['run_type']> = ['long', 'fast']

describe('weekly goals constants', () => {
    it('lists the run types of the database enum', () => expect(RUN_TYPES).toEqual(DB_RUN_TYPES))

    it('keeps the default run type rules inside the limits', () => {
        expect(DEFAULT_RUN_TYPE_RULES.shortRunMaxM).toBeGreaterThan(0)
        expect(DEFAULT_RUN_TYPE_RULES.shortRunMaxM).toBeLessThan(DEFAULT_RUN_TYPE_RULES.longRunMinM)
        expect(DEFAULT_RUN_TYPE_RULES.longRunMinM).toBeLessThanOrEqual(
            WEEKLY_GOAL_LIMITS.runTypeDistanceMaxM
        )
        expect(DEFAULT_RUN_TYPE_RULES.fastPaceSPerKm).toBeGreaterThanOrEqual(
            WEEKLY_GOAL_LIMITS.fastPaceMinSPerKm
        )
        expect(DEFAULT_RUN_TYPE_RULES.fastPaceSPerKm).toBeLessThanOrEqual(
            WEEKLY_GOAL_LIMITS.fastPaceMaxSPerKm
        )
    })
})
