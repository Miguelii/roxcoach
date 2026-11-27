import { describe, expect, it } from 'vitest'
import { DEFAULT_RUN_TYPE_RULES } from '@/_bff/core/constants/weekly-goals.constants'
import { classifyRun } from '@/_bff/modules/training/helpers/classify-run.helper'

describe('classifyRun', () => {
    it.each([
        [5100, 1708, null, 'long'],
        [5000, 1450, null, 'fast'],
        [6000, 1770, null, 'fast'],
        [6010, 1500, null, 'long'],
        [2500, 675, null, null],
        [3000, 870, null, 'fast'],
        [5000, null, 1450, 'fast'],
        [5000, null, null, null],
        [null, 1450, null, null],
    ])(
        'classifies %s m in %s s (elapsed %s) as %s',
        (distanceM, movingTimeS, elapsedTimeS, expected) =>
            expect(
                classifyRun({ distanceM, movingTimeS, elapsedTimeS }, DEFAULT_RUN_TYPE_RULES)
            ).toBe(expected)
    )

    it('treats a pace of exactly 5:00/km as long', () =>
        expect(
            classifyRun(
                { distanceM: 5000, movingTimeS: 1500, elapsedTimeS: null },
                DEFAULT_RUN_TYPE_RULES
            )
        ).toBe('long'))

    it('returns null for a zero distance or a zero time', () => {
        expect(
            classifyRun(
                { distanceM: 0, movingTimeS: 1500, elapsedTimeS: null },
                DEFAULT_RUN_TYPE_RULES
            )
        ).toBeNull()
        expect(
            classifyRun(
                { distanceM: 5000, movingTimeS: 0, elapsedTimeS: 1500 },
                DEFAULT_RUN_TYPE_RULES
            )
        ).toBeNull()
    })

    it('uses custom rules', () =>
        expect(
            classifyRun(
                { distanceM: 7000, movingTimeS: 1960, elapsedTimeS: null },
                { shortRunMaxM: 4000, longRunMinM: 8000, fastPaceSPerKm: 285 }
            )
        ).toBe('fast'))
})
