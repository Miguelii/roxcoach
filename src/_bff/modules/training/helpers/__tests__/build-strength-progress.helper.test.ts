import { describe, expect, it } from 'vitest'
import { buildStrengthProgress } from '@/_bff/modules/training/helpers/build-strength-progress.helper'

type SetArg = Parameters<typeof buildStrengthProgress>[0]['sets'][number]

const set = (
    activityId: string,
    exercise: string,
    reps: number | null,
    loadKg: number | null,
    sourceExerciseId: string | null = null
): SetArg => ({ activityId, exercise, sourceExerciseId, reps, loadKg })

const wk = (activityId: string, localDate: string, bodyWeightKg: number | null = null) => ({
    activityId,
    localDate,
    bodyWeightKg,
})

const build = (workouts: ReturnType<typeof wk>[], sets: SetArg[]) =>
    buildStrengthProgress({ range: '3m', today: '2026-11-20', workouts, sets })

describe('buildStrengthProgress', () => {
    it('echoes the range and handles no data', () => {
        const dto = build([], [])
        expect(dto).toEqual({ range: '3m', exercises: [], bodyWeight: [] })
    })

    it('computes top set and Epley estimate, ignoring 15-rep sets for 1RM', () => {
        const dto = build(
            [wk('a', '2026-11-01')],
            [set('a', 'Squat', 5, 100), set('a', 'Squat', 15, 120)]
        )
        expect(dto.exercises[0]?.points).toEqual([
            { date: '2026-11-01', topSetKg: 120, estimatedOneRmKg: 116.7 },
        ])
    })

    it('never produces NaN for null reps or load', () => {
        const dto = build(
            [wk('a', '2026-11-01')],
            [set('a', 'Squat', null, 100), set('a', 'Squat', 5, null), set('a', 'Squat', 5, 80)]
        )
        expect(dto.exercises[0]?.points[0]).toEqual({
            date: '2026-11-01',
            topSetKg: 80,
            estimatedOneRmKg: 93.3,
        })
    })

    it('excludes exercises with no usable load before ranking', () => {
        const dto = build(
            [wk('a', '2026-11-01'), wk('b', '2026-11-02')],
            [
                set('a', 'Plank', null, null),
                set('b', 'Plank', null, null),
                set('a', 'Squat', 5, 100),
            ]
        )
        expect(dto.exercises.map((e) => e.name)).toEqual(['Squat'])
    })

    it('ranks by workouts, then sets, then name', () => {
        const dto = build(
            [wk('a', '2026-11-01'), wk('b', '2026-11-02')],
            [
                set('a', 'Bench', 5, 60),
                set('a', 'Bench', 5, 60),
                set('a', 'Row', 5, 50),
                set('b', 'Row', 5, 50),
                set('a', 'Curl', 5, 20),
                set('b', 'Curl', 5, 20),
                set('a', 'Alpha', 5, 20),
            ]
        )
        expect(dto.exercises.map((e) => e.name)).toEqual(['Curl', 'Row', 'Bench', 'Alpha'])
        expect(dto.exercises[0]?.workouts).toBe(2)
    })

    it('keys by source id else lower-cased name and shows the most recent name', () => {
        const dto = build(
            [wk('a', '2026-11-01'), wk('b', '2026-11-08')],
            [
                set('a', 'Back Squat', 5, 100, 'sq'),
                set('b', 'Squat (barbell)', 5, 105, 'sq'),
                set('a', ' Bench ', 5, 60),
                set('b', 'bench', 5, 62),
            ]
        )
        const byKey = Object.fromEntries(dto.exercises.map((e) => [e.key, e]))
        expect(byKey['sq']?.name).toBe('Squat (barbell)')
        expect(byKey['bench']?.name).toBe('bench')
        expect(byKey['bench']?.workouts).toBe(2)
    })

    it('collapses two workouts on the same date to one point with the max', () => {
        const dto = build(
            [wk('a', '2026-11-01'), wk('b', '2026-11-01')],
            [set('a', 'Squat', 5, 100), set('b', 'Squat', 3, 110)]
        )
        const points = dto.exercises[0]?.points
        expect(points).toHaveLength(1)
        expect(points?.[0]?.topSetKg).toBe(110)
        expect(points?.[0]?.estimatedOneRmKg).toBe(121)
        expect(dto.exercises[0]?.workouts).toBe(2)
    })

    it('returns only the first five exercises, points ascending', () => {
        const names = ['A', 'B', 'C', 'D', 'E', 'F']
        const dto = build(
            [wk('a', '2026-11-08'), wk('b', '2026-11-01')],
            [...names.map((n) => set('a', n, 5, 50)), set('b', 'A', 5, 50)]
        )
        expect(dto.exercises).toHaveLength(5)
        expect(dto.exercises[0]?.points.map((p) => p.date)).toEqual(['2026-11-01', '2026-11-08'])
    })

    it('keeps the last body weight per date and skips nulls', () => {
        const dto = build(
            [
                wk('a', '2026-11-02', 80),
                wk('b', '2026-11-02', 81),
                wk('c', '2026-11-01', null),
                wk('d', '2026-11-03', 0),
            ],
            []
        )
        expect(dto.bodyWeight).toEqual([{ date: '2026-11-02', kg: 81 }])
    })
})
