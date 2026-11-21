import { describe, expect, it } from 'vitest'
import type { ExerciseComparisonDTO, StrengthSetDTO } from '@/_bff/modules/training/types'
import { findRecords, lyftaRecordTypesOf, recordsAreKnown } from '@/modules/activity/strength-utils'

const set = (
    exercise: string,
    sourceExerciseId: string | null,
    exerciseIndex: number | null,
    reps: number,
    loadKg: number,
    lyftaRecords: StrengthSetDTO['lyftaRecords'] = []
): StrengthSetDTO => ({
    exercise,
    exerciseIndex,
    exerciseImageUrl: null,
    sourceExerciseId,
    setIndex: 1,
    reps,
    loadKg,
    rir: null,
    rpe: null,
    lyftaRecords,
})

const comparison = (
    key: string,
    best: { top: number | null; e1rm?: number | null; volume?: number | null }
): ExerciseComparisonDTO => ({
    key,
    previous:
        best.top === null
            ? null
            : { localDate: '2026-11-01', topSetKg: 1, topSetReps: 1, volumeKg: 1 },
    bestPriorTopSetKg: best.top,
    bestPriorE1rmKg: best.e1rm ?? null,
    bestPriorVolumeKg: best.volume ?? null,
})

describe('findRecords from our own comparison', () => {
    it('lists the exercises that beat an earlier best, in workout order, with the gain', () => {
        const records = findRecords({
            source: 'manual',
            strengthSets: [
                set('Row', '502', 2, 10, 60),
                set('Bench Press', '501', 1, 5, 82.5),
                set('Squat', '503', 3, 5, 100),
            ],
            comparisons: [
                comparison('501', { top: 80 }),
                comparison('502', { top: 60 }),
                comparison('503', { top: 90 }),
            ],
        })

        expect(records.map((record) => record.exercise)).toEqual(['Bench Press', 'Squat'])
        expect(records[0]?.kinds).toEqual([
            { type: 'weight', valueKg: 82.5, setText: '82.5 kg x 5', deltaKg: 2.5 },
        ])
    })

    it('reports each measure on its own: 1RM and volume without a heavier weight', () => {
        const records = findRecords({
            source: 'manual',
            strengthSets: [set('Squat', '503', 1, 10, 100), set('Squat', '503', 1, 10, 100)],
            comparisons: [comparison('503', { top: 100, e1rm: 120, volume: 1500 })],
        })

        expect(records[0]?.kinds.map((kind) => kind.type)).toEqual(['e1rm', 'volume'])
        expect(records[0]?.kinds[1]).toMatchObject({ valueKg: 2000, deltaKg: 500 })
    })

    it('never counts a first time, an equal best or an exercise without a comparison', () => {
        const records = findRecords({
            source: 'manual',
            strengthSets: [
                set('A', '1', 1, 5, 50),
                set('B', '2', 2, 5, 60),
                set('C', '3', 3, 5, 70),
            ],
            comparisons: [
                comparison('1', { top: null }),
                comparison('2', { top: 60, e1rm: 70, volume: 300 }),
            ],
        })

        expect(records).toEqual([])
    })
})

describe('findRecords from Lyfta', () => {
    it('uses the records Lyfta flagged, the best value per type, and ignores type 2', () => {
        const records = findRecords({
            source: 'lyfta',
            strengthSets: [
                set('Press', '176', 1, 6, 25, [{ type: 1, level: 2, value: 30 }]),
                set('Press', '176', 1, 7, 35, [
                    { type: 1, level: 2, value: 43 },
                    { type: 3, level: 1, value: 245 },
                    { type: 2, level: 1, value: 35 },
                ]),
            ],
            comparisons: [],
        })

        expect(records).toEqual([
            {
                key: '176',
                exercise: 'Press',
                kinds: [
                    { type: 'e1rm', valueKg: 43, setText: '35 kg x 7', deltaKg: null },
                    { type: 'set-volume', valueKg: 245, setText: '35 kg x 7', deltaKg: null },
                ],
            },
        ])
    })

    it('does not fall back to our comparison when Lyfta flagged nothing', () => {
        const records = findRecords({
            source: 'lyfta',
            strengthSets: [set('Row', '502', 1, 10, 60)],
            comparisons: [comparison('502', { top: 10, e1rm: 10, volume: 10 })],
        })

        expect(records).toEqual([])
    })
})

describe('lyftaRecordTypesOf', () => {
    it('maps the known types of a set without repeats', () => {
        expect(
            lyftaRecordTypesOf(
                set('A', '1', 1, 5, 50, [
                    { type: 1, level: 1, value: 1 },
                    { type: 1, level: 2, value: 2 },
                    { type: 3, level: 1, value: 3 },
                    { type: 9, level: 1, value: 4 },
                ])
            )
        ).toEqual(['e1rm', 'set-volume'])
    })
})

describe('recordsAreKnown', () => {
    it('is always known for Lyfta and needs an earlier workout otherwise', () => {
        expect(recordsAreKnown('lyfta', [])).toBe(true)
        expect(recordsAreKnown('manual', [])).toBe(false)
        expect(recordsAreKnown('manual', [comparison('1', { top: 50 })])).toBe(true)
    })
})
