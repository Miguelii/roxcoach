/* oxlint-disable max-lines -- one suite per module, one case per behavior */
// oxlint-disable max-lines-per-function
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseLyftaWorkoutPage } from '@/_bff/modules/lyfta/utils/workouts.utils'

const SANDBOX_PAGE = {
    status: true,
    count: 2,
    total_records: 2,
    total_pages: 1,
    current_page: 1,
    limit: 100,
    workouts: [
        {
            id: 1001,
            title: 'Upper Strength',
            workout_perform_date: '2026-08-20T17:05:00.000Z',
            workout_duration: '00:45:10',
            weight_unit: 'kg',
            body_weight: 72.5,
            total_volume: 1840,
            exercises: [
                {
                    exercise_id: 501,
                    excercise_name: 'Bench Press',
                    exercise_image: 'https://lyfta.app/images/exercises/00251101.png',
                    sets: [
                        { weight: '80', reps: '5', rir: '2', is_completed: true },
                        { weight: '90', reps: '3', rir: null, is_completed: true },
                    ],
                },
            ],
        },
    ],
}

describe('parseLyftaWorkoutPage', () => {
    it('parses the sandbox shape and preserves Lyfta field spelling and stable IDs', () => {
        const result = parseLyftaWorkoutPage(SANDBOX_PAGE, 1)

        expect(result).toEqual({
            success: true,
            data: {
                currentPage: 1,
                totalPages: 1,
                workouts: [
                    {
                        sourceId: '1001',
                        title: 'Upper Strength',
                        startedAt: '2026-08-20T17:05:00.000Z',
                        durationSeconds: 2710,
                        bodyWeightKg: 72.5,
                        totalVolumeKgReps: 1840,
                        exercises: [
                            {
                                exerciseId: '501',
                                name: 'Bench Press',
                                imageUrl: 'https://lyfta.app/images/exercises/00251101.png',
                                sets: [
                                    { setIndex: 1, reps: 5, loadKg: 80, rir: 2 },
                                    { setIndex: 2, reps: 3, loadKg: 90, rir: null },
                                ],
                            },
                        ],
                    },
                ],
            },
        })
    })

    it('normalizes the live API timestamp format as UTC', () => {
        const workout = {
            ...SANDBOX_PAGE.workouts[0],
            workout_perform_date: '2026-11-13 22:24:46',
        }
        const result = parseLyftaWorkoutPage({ ...SANDBOX_PAGE, workouts: [workout] }, 1)

        expect(result).toMatchObject({
            success: true,
            data: {
                workouts: [{ startedAt: '2026-11-13T22:24:46.000Z' }],
            },
        })
    })

    it('imports sets with reps or weight even when Lyfta does not mark them completed', () => {
        const result = parseLyftaWorkoutPage(
            {
                ...SANDBOX_PAGE,
                workouts: [
                    {
                        ...SANDBOX_PAGE.workouts[0],
                        exercises: [
                            {
                                exercise_id: 503,
                                excercise_name: 'Chest Press',
                                sets: [
                                    { is_completed: false, reps: '10', weight: '60' },
                                    { is_completed: false, reps: '8', weight: '65', rir: '1' },
                                    { is_completed: false, reps: '', weight: '' },
                                    { is_completed: false },
                                ],
                            },
                        ],
                    },
                ],
            },
            1
        )

        expect(result.success).toBe(true)
        if (!result.success) return
        expect(result.data.workouts[0]?.exercises[0]?.sets).toEqual([
            { setIndex: 1, reps: 10, loadKg: 60, rir: null },
            { setIndex: 2, reps: 8, loadKg: 65, rir: 1 },
        ])
    })

    it('skips an incomplete set with malformed values instead of failing the page', () => {
        const result = parseLyftaWorkoutPage(
            {
                ...SANDBOX_PAGE,
                workouts: [
                    {
                        ...SANDBOX_PAGE.workouts[0],
                        exercises: [
                            {
                                exercise_id: 502,
                                excercise_name: 'Deadlift',
                                sets: [
                                    { is_completed: false, reps: 'not-a-number', weight: '100' },
                                    { is_completed: false, reps: '5', weight: '100' },
                                ],
                            },
                        ],
                    },
                ],
            },
            1
        )

        expect(result.success).toBe(true)
        if (!result.success) return
        expect(result.data.workouts[0]?.exercises[0]?.sets).toEqual([
            { setIndex: 2, reps: 5, loadKg: 100, rir: null },
        ])
    })

    it('reads the records Lyfta flags on a set, single or comma separated', () => {
        const result = parseLyftaWorkoutPage(
            {
                ...SANDBOX_PAGE,
                workouts: [
                    {
                        ...SANDBOX_PAGE.workouts[0],
                        exercises: [
                            {
                                exercise_id: 1511,
                                excercise_name: 'Skull Crusher',
                                sets: [
                                    {
                                        is_completed: false,
                                        reps: '10',
                                        weight: '10.000',
                                        record_type: null,
                                        record_level: null,
                                        record_value: null,
                                    },
                                    {
                                        is_completed: false,
                                        reps: '7',
                                        weight: '35.000',
                                        record_type: '1',
                                        record_level: '2',
                                        record_value: '43',
                                    },
                                    {
                                        is_completed: false,
                                        reps: '9',
                                        weight: '15.000',
                                        record_type: '1,3',
                                        record_level: '1,1',
                                        record_value: '20,135',
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            1
        )

        expect(result.success).toBe(true)
        if (!result.success) return
        const sets = result.data.workouts[0]?.exercises[0]?.sets
        expect(sets?.[0]).not.toHaveProperty('records')
        expect(sets?.[1]?.records).toEqual([{ type: 1, level: 2, value: 43 }])
        expect(sets?.[2]?.records).toEqual([
            { type: 1, level: 1, value: 20 },
            { type: 3, level: 1, value: 135 },
        ])
    })

    it('drops malformed record entries instead of rejecting the workout', () => {
        const result = parseLyftaWorkoutPage(
            {
                ...SANDBOX_PAGE,
                workouts: [
                    {
                        ...SANDBOX_PAGE.workouts[0],
                        exercises: [
                            {
                                exercise_id: 502,
                                excercise_name: 'Deadlift',
                                sets: [
                                    {
                                        is_completed: true,
                                        reps: '5',
                                        weight: '100',
                                        record_type: 'abc,3,0',
                                        record_level: 'x',
                                        record_value: ',oops',
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            1
        )

        expect(result.success).toBe(true)
        if (!result.success) return
        expect(result.data.workouts[0]?.exercises[0]?.sets[0]?.records).toEqual([
            { type: 3, level: null, value: null },
        ])
    })

    it('keeps completed sets with no values and maps absent optional values to null', () => {
        // The incomplete set below is empty, so it is dropped; completed ones are always kept.
        const result = parseLyftaWorkoutPage(
            {
                ...SANDBOX_PAGE,
                workouts: [
                    {
                        ...SANDBOX_PAGE.workouts[0],
                        exercises: [
                            {
                                exercise_id: 502,
                                excercise_name: 'Deadlift',
                                sets: [
                                    { is_completed: false, reps: 'not-a-number', weight: '' },
                                    { is_completed: true },
                                    { is_completed: true, reps: '6', weight: '100.5' },
                                ],
                            },
                        ],
                    },
                ],
            },
            1
        )

        expect(result.success).toBe(true)
        if (!result.success) return
        expect(result.data.workouts[0]?.exercises[0]?.sets).toEqual([
            { setIndex: 2, reps: null, loadKg: null, rir: null },
            { setIndex: 3, reps: 6, loadKg: 100.5, rir: null },
        ])
    })

    it.each([
        ['malformed reps', { reps: 'five', weight: '80' }],
        ['malformed weight', { reps: '5', weight: 'eighty' }],
        ['negative weight', { reps: '5', weight: '-10' }],
        ['fractional reps', { reps: '5.5', weight: '80' }],
        ['negative RIR', { reps: '5', weight: '80', rir: '-1' }],
    ])('rejects %s instead of silently dropping a completed set', (_label, set) => {
        const result = parseLyftaWorkoutPage(
            {
                ...SANDBOX_PAGE,
                workouts: [
                    {
                        ...SANDBOX_PAGE.workouts[0],
                        exercises: [
                            {
                                exercise_id: 501,
                                excercise_name: 'Bench Press',
                                sets: [{ ...set, is_completed: true }],
                            },
                        ],
                    },
                ],
            },
            1
        )

        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.issues).toContain(
            'rir' in set && set.rir === '-1'
                ? 'workouts.0.exercises.0.sets.0.rir'
                : set.reps === '5.5' || set.reps === 'five'
                  ? 'workouts.0.exercises.0.sets.0.reps'
                  : 'workouts.0.exercises.0.sets.0.weight'
        )
        expect(result.issues.join(' ')).not.toContain('five')
        expect(result.issues.join(' ')).not.toContain('eighty')
    })

    it.each([
        ['date without timezone', { workout_perform_date: '2026-08-20T17:05:00' }],
        ['invalid date', { workout_perform_date: 'yesterday' }],
        ['invalid workout id', { id: 'abc' }],
    ])('rejects %s', (_label, override) => {
        const workout = { ...SANDBOX_PAGE.workouts[0], ...override }
        const result = parseLyftaWorkoutPage({ ...SANDBOX_PAGE, workouts: [workout] }, 1)

        expect(result.success).toBe(false)
    })

    it('rejects a missing exercise name', () => {
        const result = parseLyftaWorkoutPage(
            {
                ...SANDBOX_PAGE,
                workouts: [
                    {
                        ...SANDBOX_PAGE.workouts[0],
                        exercises: [{ exercise_id: 501, excercise_name: '', sets: [] }],
                    },
                ],
            },
            1
        )

        expect(result.success).toBe(false)
    })

    it.each([
        ['unknown origin', 'https://example.com/exercise.png'],
        ['unsupported CDN path', 'https://apilyfta.com/static/other/exercise.png'],
        ['userinfo', 'https://u@lyfta.app/images/exercises/x'],
        ['user and password', 'https://u:p@lyfta.app/images/exercises/x'],
        ['explicit port', 'https://lyfta.app:8443/images/exercises/x'],
    ])('rejects exercise images from an %s', (_reason, imageUrl) => {
        const result = parseLyftaWorkoutPage(
            {
                ...SANDBOX_PAGE,
                workouts: [
                    {
                        ...SANDBOX_PAGE.workouts[0],
                        exercises: [
                            {
                                ...SANDBOX_PAGE.workouts[0].exercises[0],
                                exercise_image: imageUrl,
                            },
                        ],
                    },
                ],
            },
            1
        )

        expect(result).toEqual({
            success: false,
            issues: ['workouts.0.exercises.0.exercise_image'],
        })
    })

    it('accepts a normal Lyfta catalog image URL, with the default https port spelled out', () => {
        const imageUrl = 'https://lyfta.app/images/exercises/x.png'
        const workout = {
            ...SANDBOX_PAGE.workouts[0],
            exercises: [{ ...SANDBOX_PAGE.workouts[0].exercises[0], exercise_image: imageUrl }],
        }

        expect(parseLyftaWorkoutPage({ ...SANDBOX_PAGE, workouts: [workout] }, 1)).toMatchObject({
            success: true,
            data: { workouts: [{ exercises: [{ imageUrl }] }] },
        })
    })

    it('accepts live Gymvisual exercise image URLs', () => {
        const imageUrl =
            'https://apilyfta.com/static/GymvisualPNG/02411101-Cable-Triceps-Pushdown-(V-bar-attachment)_Upper-Arms_small.png'
        const workout = {
            ...SANDBOX_PAGE.workouts[0],
            exercises: [
                {
                    ...SANDBOX_PAGE.workouts[0].exercises[0],
                    exercise_image: imageUrl,
                },
            ],
        }
        const result = parseLyftaWorkoutPage({ ...SANDBOX_PAGE, workouts: [workout] }, 1)

        expect(result).toMatchObject({
            success: true,
            data: {
                workouts: [{ exercises: [{ imageUrl }] }],
            },
        })
    })

    it('converts pounds to kilograms and stores exercise metadata and workout duration', () => {
        const workout = {
            ...SANDBOX_PAGE.workouts[0],
            weight_unit: 'lb',
            body_weight: 150,
            total_volume: 5000,
            exercises: [
                {
                    exercise_id: 812,
                    excercise_name: 'Back Squat',
                    sets: [{ is_completed: true, reps: '5', weight: '100', rir: 1 }],
                },
            ],
        }
        const result = parseLyftaWorkoutPage({ ...SANDBOX_PAGE, workouts: [workout] }, 1)

        expect(result).toMatchObject({
            success: true,
            data: {
                workouts: [
                    {
                        durationSeconds: 2710,
                        bodyWeightKg: 68.039,
                        totalVolumeKgReps: 2267.962,
                        exercises: [
                            {
                                exerciseId: '812',
                                name: 'Back Squat',
                                sets: [{ setIndex: 1, reps: 5, loadKg: 45.359, rir: 1 }],
                            },
                        ],
                    },
                ],
            },
        })
    })

    it('rejects weighted workouts when the source unit is missing or unsupported', () => {
        const {
            weight_unit: _weightUnit,
            body_weight: _bodyWeight,
            total_volume: _totalVolume,
            ...workoutWithoutUnit
        } = SANDBOX_PAGE.workouts[0]
        const missingUnit = parseLyftaWorkoutPage(
            { ...SANDBOX_PAGE, workouts: [workoutWithoutUnit] },
            1
        )
        const unsupportedUnit = parseLyftaWorkoutPage(
            {
                ...SANDBOX_PAGE,
                workouts: [{ ...SANDBOX_PAGE.workouts[0], weight_unit: 'stone' }],
            },
            1
        )

        expect(missingUnit).toEqual({
            success: false,
            issues: ['workouts.0.weight_unit'],
        })
        expect(unsupportedUnit.success).toBe(false)
    })

    it('rejects a response page that does not match the requested page', () => {
        expect(parseLyftaWorkoutPage(SANDBOX_PAGE, 2)).toEqual({
            success: false,
            issues: ['pagination'],
        })
    })

    it('rejects duplicate source IDs in one page', () => {
        const workout = SANDBOX_PAGE.workouts[0]
        const result = parseLyftaWorkoutPage({ ...SANDBOX_PAGE, workouts: [workout, workout] }, 1)

        expect(result).toEqual({ success: false, issues: ['workouts.1.id'] })
    })
})
