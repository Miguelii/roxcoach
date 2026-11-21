import { describe, expect, it } from 'vitest'
import type { TopExerciseDTO } from '@/_bff/modules/training/types/progress'
import { buildExerciseRows, exerciseSummary } from '@/modules/dashboard/progress/top-exercises-data'

const exercise = (key: string, points: [string, number][]): TopExerciseDTO => ({
    key,
    name: key,
    imageUrl: null,
    workouts: points.length,
    points: points.map(([date, topSetKg]) => ({ date, topSetKg })),
})

const SQUAT = exercise('squat', [
    ['2026-11-01', 100],
    ['2026-11-15', 110],
])
const BENCH = exercise('bench', [
    ['2026-11-08', 80],
    ['2026-11-15', 84],
])

describe('buildExerciseRows', () => {
    it('lists every date of any exercise, ascending, with null where it was not trained', () => {
        expect(buildExerciseRows([SQUAT, BENCH], 'kg')).toEqual([
            { date: '2026-11-01', values: [100, null] },
            { date: '2026-11-08', values: [null, 80] },
            { date: '2026-11-15', values: [110, 84] },
        ])
    })

    it('turns the values into the change since each exercise first workout', () => {
        expect(buildExerciseRows([SQUAT, BENCH], 'percent')).toEqual([
            { date: '2026-11-01', values: [0, null] },
            { date: '2026-11-08', values: [null, 0] },
            { date: '2026-11-15', values: [10, 5] },
        ])
    })

    it('has no rows without exercises', () => {
        expect(buildExerciseRows([], 'kg')).toEqual([])
    })
})

describe('exerciseSummary', () => {
    it('gives the latest top set and the change from the first', () => {
        expect(exerciseSummary(SQUAT)).toEqual({ latestKg: 110, changeKg: 10, changePct: 10 })
    })

    it('has no change with a single workout and no summary without points', () => {
        expect(exerciseSummary(exercise('curl', [['2026-11-01', 20]]))).toEqual({
            latestKg: 20,
            changeKg: null,
            changePct: null,
        })
        expect(exerciseSummary(exercise('none', []))).toBeNull()
    })
})
