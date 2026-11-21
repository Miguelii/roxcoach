import { describe, expect, it } from 'vitest'
import { buildStrengthComparison } from '@/_bff/modules/training/helpers/build-strength-comparison.helper'

const set = (
    activityId: string,
    exercise: string,
    sourceExerciseId: string | null,
    reps: number,
    loadKg: number | null
) => ({ activityId, exercise, sourceExerciseId, reps, loadKg })

const HISTORY = [
    { activityId: 'w2', localDate: '2026-11-09' },
    { activityId: 'w1', localDate: '2026-11-02' },
]

describe('buildStrengthComparison', () => {
    it('takes the most recent earlier session and the best of every measure ever', () => {
        const result = buildStrengthComparison({
            current: [{ exercise: 'Bench Press', sourceExerciseId: '501' }],
            history: HISTORY,
            sets: [
                set('w2', 'Bench Press', '501', 8, 70),
                set('w2', 'Bench Press', '501', 8, 70),
                set('w1', 'Bench Press', '501', 5, 80),
            ],
        })

        expect(result).toEqual([
            {
                key: '501',
                previous: { localDate: '2026-11-09', topSetKg: 70, topSetReps: 8, volumeKg: 1120 },
                bestPriorTopSetKg: 80,
                // 80 x 5 estimates 93.3, above 70 x 8 at 88.7.
                bestPriorE1rmKg: 93.3,
                // w2 = 1120 kg beats w1 = 400 kg.
                bestPriorVolumeKg: 1120,
            },
        ])
    })

    it('keeps the 1RM and volume bests apart from the heaviest weight', () => {
        const result = buildStrengthComparison({
            current: [{ exercise: 'Squat', sourceExerciseId: '503' }],
            history: HISTORY,
            sets: [
                // Heaviest weight, but light on reps and volume.
                set('w1', 'Squat', '503', 1, 120),
                // Lighter, many reps: the higher estimate and volume.
                set('w2', 'Squat', '503', 10, 100),
                set('w2', 'Squat', '503', 10, 100),
            ],
        })

        expect(result[0]).toMatchObject({
            bestPriorTopSetKg: 120,
            bestPriorE1rmKg: 133.3,
            bestPriorVolumeKg: 2000,
        })
    })

    it('has no previous session or best the first time, one entry per exercise', () => {
        const result = buildStrengthComparison({
            current: [
                { exercise: 'Row', sourceExerciseId: null },
                { exercise: 'row', sourceExerciseId: null },
            ],
            history: HISTORY,
            sets: [set('w1', 'Bench Press', '501', 5, 80)],
        })

        expect(result).toEqual([
            {
                key: 'row',
                previous: null,
                bestPriorTopSetKg: null,
                bestPriorE1rmKg: null,
                bestPriorVolumeKg: null,
            },
        ])
    })

    it('matches manual exercises by name and keeps a bodyweight session without any best', () => {
        const result = buildStrengthComparison({
            current: [{ exercise: 'Pull up', sourceExerciseId: null }],
            history: HISTORY,
            sets: [set('w2', ' pull UP ', null, 10, null)],
        })

        expect(result).toEqual([
            {
                key: 'pull up',
                previous: {
                    localDate: '2026-11-09',
                    topSetKg: null,
                    topSetReps: null,
                    volumeKg: 0,
                },
                bestPriorTopSetKg: null,
                bestPriorE1rmKg: null,
                bestPriorVolumeKg: null,
            },
        ])
    })
})
