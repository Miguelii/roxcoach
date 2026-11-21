import { describe, expect, it } from 'vitest'
import { buildStrengthProgress } from '@/_bff/modules/training/helpers/build-strength-progress.helper'

type SetInput = {
    activityId: string
    exercise: string
    exerciseImageUrl: string | null
    sourceExerciseId: string | null
    reps: number | null
    loadKg: number | null
}

const wk = (activityId: string, localDate: string) => ({ activityId, localDate })

const set = (
    activityId: string,
    exercise: string,
    reps: number | null,
    loadKg: number | null,
    overrides: Partial<SetInput> = {}
): SetInput => ({
    activityId,
    exercise,
    exerciseImageUrl: null,
    sourceExerciseId: null,
    reps,
    loadKg,
    ...overrides,
})

const run = (workouts: ReturnType<typeof wk>[], sets: SetInput[]) =>
    buildStrengthProgress({ range: '3m', today: '2026-11-21', workouts, sets })

describe('buildStrengthProgress', () => {
    it('echoes the range and handles no data with empty buckets', () => {
        const dto = run([], [])

        expect(dto.range).toBe('3m')
        expect(dto.granularity).toBe('week')
        expect(dto.exercises).toEqual([])
        expect(dto.buckets).toHaveLength(13)
        expect(dto.buckets.every((b) => b.volumeKg === 0 && b.workouts === 0 && b.sets === 0)).toBe(
            true
        )
    })

    it('keeps the heaviest set of every workout date, ascending', () => {
        const dto = run(
            [wk('a', '2026-11-01'), wk('b', '2026-11-08')],
            [
                set('a', 'Squat', 5, 100),
                set('a', 'Squat', 5, 120),
                set('a', 'Squat', 8, 90),
                set('b', 'Squat', 3, 125),
            ]
        )

        expect(dto.exercises[0]?.points).toEqual([
            { date: '2026-11-01', topSetKg: 120, topSetReps: 5 },
            { date: '2026-11-08', topSetKg: 125, topSetReps: 3 },
        ])
    })

    it('takes the set with more reps when two sets share the heaviest load', () => {
        const dto = run(
            [wk('a', '2026-11-01')],
            [set('a', 'Squat', 5, 100), set('a', 'Squat', 8, 100), set('a', 'Squat', 6, 100)]
        )

        expect(dto.exercises[0]?.points).toEqual([
            { date: '2026-11-01', topSetKg: 100, topSetReps: 8 },
        ])
    })

    it('never produces NaN or zero for null reps or load', () => {
        const dto = run(
            [wk('a', '2026-11-01'), wk('b', '2026-11-08')],
            [
                set('a', 'Squat', null, 100),
                set('a', 'Squat', 5, null),
                set('a', 'Squat', 0, 100),
                set('a', 'Squat', 5, 0),
                set('b', 'Squat', 5, 80),
            ]
        )

        expect(dto.exercises[0]?.points).toEqual([
            { date: '2026-11-08', topSetKg: 80, topSetReps: 5 },
        ])
    })

    it('excludes exercises with no usable load before ranking', () => {
        const dto = run(
            [wk('a', '2026-11-01'), wk('b', '2026-11-02'), wk('c', '2026-11-03')],
            [
                set('a', 'Push-up', 20, null),
                set('b', 'Push-up', 20, null),
                set('c', 'Push-up', 20, null),
                set('c', 'Squat', 5, 100),
            ]
        )

        expect(dto.exercises.map((exercise) => exercise.name)).toEqual(['Squat'])
    })

    it('ranks by workouts, then sets, then name', () => {
        const dto = run(
            [wk('a', '2026-11-01'), wk('b', '2026-11-02')],
            [
                set('a', 'Curl', 10, 20),
                set('b', 'Curl', 10, 20),
                set('a', 'Bench', 5, 80),
                set('b', 'Bench', 5, 80),
                set('b', 'Bench', 5, 80),
                set('a', 'Row', 5, 60),
                set('b', 'Dip', 5, 10),
                set('b', 'Dip', 5, 10),
                set('b', 'Dip', 5, 10),
            ]
        )

        expect(dto.exercises.map((exercise) => exercise.name)).toEqual([
            'Bench',
            'Curl',
            'Dip',
            'Row',
        ])
    })

    it('keys by source id else lower-cased name and shows the most recent name', () => {
        const dto = run(
            [wk('a', '2026-11-01'), wk('b', '2026-11-08')],
            [
                set('a', 'Back Squat', 5, 100, { sourceExerciseId: '7' }),
                set('b', 'Squat (barbell)', 5, 105, { sourceExerciseId: '7' }),
                set('a', ' Bench ', 5, 80),
                set('b', 'bench', 5, 82),
            ]
        )

        expect(dto.exercises).toHaveLength(2)
        expect(dto.exercises.map((exercise) => exercise.name).toSorted()).toEqual([
            'Squat (barbell)',
            'bench',
        ])
    })

    it('uses the picture of the most recent workout that has one', () => {
        const dto = run(
            [wk('a', '2026-11-01'), wk('b', '2026-11-08'), wk('c', '2026-11-15')],
            [
                set('a', 'Squat', 5, 100, {
                    exerciseImageUrl: 'https://lyfta.app/images/exercises/old.png',
                }),
                set('b', 'Squat', 5, 105, {
                    exerciseImageUrl: 'https://lyfta.app/images/exercises/new.png',
                }),
                set('c', 'Squat', 5, 110),
            ]
        )

        expect(dto.exercises[0]?.imageUrl).toBe('https://lyfta.app/images/exercises/new.png')
    })

    it('has no picture when no set carries one', () => {
        expect(
            run([wk('a', '2026-11-01')], [set('a', 'Squat', 5, 100)]).exercises[0]?.imageUrl
        ).toBeNull()
    })

    it('returns at most twelve exercises, the most used first', () => {
        const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N']
        const dto = run(
            [wk('a', '2026-11-01'), wk('b', '2026-11-08')],
            [...names.map((name) => set('a', name, 5, 50)), set('b', 'N', 5, 50)]
        )

        expect(dto.exercises).toHaveLength(12)
        expect(dto.exercises[0]?.name).toBe('N')
    })

    it('ignores sets of workouts outside the given list', () => {
        const dto = run([wk('a', '2026-11-01')], [set('x', 'Squat', 5, 100)])

        expect(dto.exercises).toEqual([])
    })

    describe('buckets', () => {
        it('sums reps times load, counts distinct workouts and sets per week, over every exercise', () => {
            const dto = run(
                [wk('a', '2026-11-16'), wk('b', '2026-11-18'), wk('c', '2026-11-03')],
                [
                    set('a', 'Squat', 5, 100),
                    set('a', 'Squat', 5, 100),
                    set('b', 'Curl', 10, 20),
                    set('c', 'Row', 8, 50),
                ]
            )

            const thisWeek = dto.buckets.at(-1)
            expect(thisWeek).toMatchObject({
                start: '2026-11-16',
                volumeKg: 1200,
                workouts: 2,
                sets: 3,
            })
            expect(dto.buckets.find((b) => b.start === '2026-11-02')).toMatchObject({
                volumeKg: 400,
                workouts: 1,
                sets: 1,
            })
        })

        it('counts a bodyweight set but adds no volume, and a workout without sets still counts', () => {
            const dto = run(
                [wk('a', '2026-11-16'), wk('b', '2026-11-17')],
                [set('a', 'Push-up', 20, null), set('a', 'Squat', null, 100)]
            )

            expect(dto.buckets.at(-1)).toMatchObject({ volumeKg: 0, workouts: 2, sets: 2 })
        })
    })
})
