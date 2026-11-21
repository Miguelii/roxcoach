import { describe, expect, it } from 'vitest'
import {
    exerciseKeyOf,
    summarizeExercise,
    summarizeWorkout,
} from '@/_bff/core/helpers/strength-detail.helper'

describe('exerciseKeyOf', () => {
    it('prefers the source exercise id and falls back to the trimmed lowercase name', () => {
        expect(exerciseKeyOf({ exercise: 'Bench Press', sourceExerciseId: '501' })).toBe('501')
        expect(exerciseKeyOf({ exercise: '  Bench Press ', sourceExerciseId: null })).toBe(
            'bench press'
        )
    })
})

describe('summarizeExercise', () => {
    it('sums volume and reps and finds the top set, preferring more reps on a tie', () => {
        const summary = summarizeExercise([
            { reps: 10, loadKg: 60, rir: 3 },
            { reps: 8, loadKg: 70, rir: 2 },
            { reps: 6, loadKg: 70, rir: 1 },
        ])

        expect(summary).toMatchObject({
            setCount: 3,
            totalReps: 24,
            volumeKg: 600 + 560 + 420,
            topSetKg: 70,
            topSetReps: 8,
            avgRir: 2,
        })
    })

    it('estimates the one-rep max with Epley and uses the load itself for one rep', () => {
        expect(summarizeExercise([{ reps: 5, loadKg: 100 }]).e1rmKg).toBe(116.7)
        expect(summarizeExercise([{ reps: 1, loadKg: 140 }]).e1rmKg).toBe(140)
    })

    it('ignores sets above 12 reps for the estimate but still counts their volume', () => {
        const summary = summarizeExercise([{ reps: 20, loadKg: 30 }])

        expect(summary.e1rmKg).toBeNull()
        expect(summary.volumeKg).toBe(600)
    })

    it('treats bodyweight and unfilled sets as no load', () => {
        const summary = summarizeExercise([
            { reps: 12, loadKg: null },
            { reps: null, loadKg: 50 },
            { reps: 10, loadKg: 0 },
        ])

        expect(summary).toMatchObject({
            setCount: 3,
            totalReps: 22,
            volumeKg: 0,
            topSetKg: null,
            topSetReps: null,
            e1rmKg: null,
            avgRir: null,
        })
    })
})

describe('summarizeWorkout', () => {
    it('counts exercises by key and finds the heaviest set of the workout', () => {
        const summary = summarizeWorkout([
            { exercise: 'Bench Press', sourceExerciseId: '501', reps: 5, loadKg: 80 },
            { exercise: 'Bench Press', sourceExerciseId: '501', reps: 5, loadKg: 85 },
            { exercise: 'Row', sourceExerciseId: null, reps: 10, loadKg: 60 },
            { exercise: 'Push up', sourceExerciseId: null, reps: 20, loadKg: null },
        ])

        expect(summary).toEqual({
            exerciseCount: 3,
            setCount: 4,
            totalReps: 40,
            volumeKg: 400 + 425 + 600,
            heaviest: { loadKg: 85, reps: 5, exercise: 'Bench Press' },
        })
    })

    it('has no heaviest set when nothing carries a load', () => {
        expect(summarizeWorkout([]).heaviest).toBeNull()
    })
})
