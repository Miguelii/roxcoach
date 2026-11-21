import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ExerciseComparisonDTO, StrengthSetDTO } from '@/_bff/modules/training/types'
import { ActivityView } from '@/modules/activity/activity-view'
import { makeActivity } from '@/modules/calendar/__tests__/fixtures'

const set = (
    exercise: string,
    sourceExerciseId: string,
    exerciseIndex: number,
    setIndex: number,
    reps: number | null,
    loadKg: number | null
): StrengthSetDTO => ({
    exercise,
    exerciseIndex,
    exerciseImageUrl: null,
    sourceExerciseId,
    setIndex,
    reps,
    loadKg,
    rir: null,
    rpe: null,
    lyftaRecords: [],
})

const SETS = [
    set('Bench Press', '501', 1, 1, 10, 60),
    set('Bench Press', '501', 1, 2, 8, 70),
    set('Bench Press', '501', 1, 3, 5, 80),
    set('Push up', '502', 2, 1, 20, null),
]

const renderStrength = (comparisons: ExerciseComparisonDTO[] = []) =>
    render(
        <ActivityView
            activity={makeActivity({ category: 'strength', movingTimeS: 3600, elapsedTimeS: 3600 })}
            laps={[]}
            strengthSets={SETS}
            strengthComparisons={comparisons}
        />
    )

describe('strength workout detail', () => {
    it('summarizes the workout from its sets', () => {
        renderStrength()

        expect(screen.getByTestId('strength-summary-exercises')).toHaveTextContent('2')
        expect(screen.getByTestId('strength-summary-sets')).toHaveTextContent('4')
        expect(screen.getByTestId('strength-summary-reps')).toHaveTextContent('43')
        expect(screen.getByTestId('strength-summary-heaviest')).toHaveTextContent('80 kg x 5')
        expect(screen.getByTestId('strength-summary-heaviest-hint')).toHaveTextContent(
            'Bench Press'
        )
        // 600 + 560 + 400 = 1560 kg over 60 minutes
        expect(screen.getByTestId('strength-summary-density')).toHaveTextContent('26 kg/min')
    })

    it('shows the top set, volume with its share, and the estimated 1RM per exercise', () => {
        renderStrength()

        expect(screen.getByTestId('strength-exercise-1-top')).toHaveTextContent('80 kg x 5')
        expect(screen.getByTestId('strength-exercise-1-volume')).toHaveTextContent(
            '1,560 kg (100%)'
        )
        expect(screen.getByTestId('strength-exercise-1-e1rm')).toHaveTextContent('93.3 kg')
    })

    it('shows no load facts for a bodyweight exercise', () => {
        renderStrength()

        expect(screen.queryByTestId('strength-exercise-2-top')).toBeNull()
        expect(screen.queryByTestId('strength-exercise-2-volume')).toBeNull()
        expect(screen.queryByTestId('strength-exercise-2-e1rm')).toBeNull()
        expect(screen.getByTestId('strength-exercise-2-set-1-volume')).toHaveTextContent('-')
    })

    it('marks the top set and scales each set bar to it', () => {
        renderStrength()

        expect(screen.getByTestId('strength-exercise-1-set-3-top')).toBeInTheDocument()
        expect(screen.queryByTestId('strength-exercise-1-set-1-top')).toBeNull()
        expect(screen.getByTestId('strength-exercise-1-set-3-bar')).toHaveStyle({
            transform: 'scaleX(1)',
        })
        expect(screen.getByTestId('strength-exercise-1-set-1-bar')).toHaveStyle({
            transform: 'scaleX(0.75)',
        })
        expect(screen.getByTestId('strength-exercise-1-set-2-volume')).toHaveTextContent('560 kg')
        expect(screen.queryByTestId('strength-exercise-2-set-1-bar')).toBeNull()
    })

    it('compares with the last session and flags a record', () => {
        renderStrength([
            {
                key: '501',
                previous: {
                    localDate: '2026-11-09',
                    topSetKg: 75,
                    topSetReps: 5,
                    volumeKg: 1400,
                },
                bestPriorTopSetKg: 75,
                bestPriorE1rmKg: null,
                bestPriorVolumeKg: null,
            },
        ])

        expect(screen.getByTestId('strength-exercise-1-compare')).toHaveTextContent(
            'Last time 9 Nov'
        )
        expect(screen.getByTestId('strength-exercise-1-top-delta')).toHaveTextContent('+5 kg')
        expect(screen.getByTestId('strength-exercise-1-volume-delta')).toHaveTextContent('+160 kg')
        expect(screen.getByTestId('strength-exercise-1-record')).toHaveTextContent('Record')
    })

    it('hides the deltas when nothing changed and the record when the best was heavier', () => {
        renderStrength([
            {
                key: '501',
                previous: {
                    localDate: '2026-11-09',
                    topSetKg: 80,
                    topSetReps: 5,
                    volumeKg: 1560,
                },
                bestPriorTopSetKg: 90,
                bestPriorE1rmKg: null,
                bestPriorVolumeKg: null,
            },
        ])

        expect(screen.getByTestId('strength-exercise-1-compare')).toHaveTextContent(
            'Last time 9 Nov'
        )
        expect(screen.queryByTestId('strength-exercise-1-top-delta')).toBeNull()
        expect(screen.queryByTestId('strength-exercise-1-volume-delta')).toBeNull()
        expect(screen.queryByTestId('strength-exercise-1-record')).toBeNull()
    })

    it('shows no comparison for a first session with the exercise', () => {
        renderStrength([
            {
                key: '501',
                previous: null,
                bestPriorTopSetKg: null,
                bestPriorE1rmKg: null,
                bestPriorVolumeKg: null,
            },
        ])

        expect(screen.queryByTestId('strength-exercise-1-compare')).toBeNull()
        expect(screen.queryByTestId('strength-exercise-1-record')).toBeNull()
    })

    it('explains the estimated 1RM and the density in an info tip that opens on tap', () => {
        renderStrength()

        const e1rmTrigger = screen.getByTestId('strength-exercise-1-e1rm-info-trigger')
        expect(e1rmTrigger).toHaveAttribute('aria-label', 'About Est. 1RM')
        expect(screen.queryByTestId('strength-exercise-1-e1rm-info-content')).toBeNull()

        fireEvent.click(e1rmTrigger)
        expect(screen.getByTestId('strength-exercise-1-e1rm-info-content')).toHaveTextContent(
            'heaviest weight you could lift once'
        )

        fireEvent.click(screen.getByTestId('strength-summary-density-info-trigger'))
        expect(screen.getByTestId('strength-summary-density-info-content')).toHaveTextContent(
            'Total volume divided by the workout time'
        )
    })

    it('keeps the headline numbers and the counts in one card', () => {
        renderStrength()

        const card = screen.getByTestId('strength-summary')
        expect(card).toContainElement(screen.getByTestId('metric-time-value'))
        expect(card).toContainElement(screen.getByTestId('strength-summary-sets'))
        expect(screen.getAllByTestId('activity-metrics')).toHaveLength(1)
    })

    it('shows the calories when the activity has them and omits them otherwise', () => {
        const { unmount } = render(
            <ActivityView
                activity={makeActivity({ category: 'strength', calories: 512.4 })}
                laps={[]}
                strengthSets={SETS}
            />
        )
        expect(screen.getByTestId('metric-calories-value')).toHaveTextContent('512 kcal')
        unmount()

        renderStrength()
        expect(screen.queryByTestId('metric-calories-value')).toBeNull()
    })

    it('gives an overview of the records set in the workout', () => {
        renderStrength([
            {
                key: '501',
                previous: { localDate: '2026-11-09', topSetKg: 75, topSetReps: 5, volumeKg: 1400 },
                bestPriorTopSetKg: 75,
                bestPriorE1rmKg: null,
                bestPriorVolumeKg: null,
            },
        ])

        expect(screen.getByTestId('strength-records-count')).toHaveTextContent('1')
        expect(screen.getByTestId('strength-record-1-name')).toHaveTextContent('Bench Press')
        expect(screen.getByTestId('strength-record-1-weight-value')).toHaveTextContent('80 kg')
        expect(screen.getByTestId('strength-record-1-weight-set')).toHaveTextContent('80 kg x 5')
        expect(screen.getByTestId('strength-record-1-weight-delta')).toHaveTextContent('+5 kg')
        expect(screen.queryByTestId('strength-records-empty')).toBeNull()
    })

    it('says so when there is history but no new record, and hides records without history', () => {
        const { unmount } = renderStrength([
            {
                key: '501',
                previous: { localDate: '2026-11-09', topSetKg: 90, topSetReps: 5, volumeKg: 1400 },
                bestPriorTopSetKg: 90,
                bestPriorE1rmKg: null,
                bestPriorVolumeKg: null,
            },
        ])
        expect(screen.getByTestId('strength-records-empty')).toHaveTextContent(
            'No new records this session.'
        )
        expect(screen.queryByTestId('strength-records-count')).toBeNull()
        unmount()

        renderStrength([
            {
                key: '501',
                previous: null,
                bestPriorTopSetKg: null,
                bestPriorE1rmKg: null,
                bestPriorVolumeKg: null,
            },
        ])
        expect(screen.queryByTestId('strength-records')).toBeNull()
    })

    it('still shows the headline numbers, without counts or records, when there are no sets', () => {
        render(
            <ActivityView
                activity={makeActivity({ category: 'strength' })}
                laps={[]}
                strengthSets={[]}
            />
        )

        expect(screen.getByTestId('metric-time-value')).toBeInTheDocument()
        expect(screen.queryByTestId('strength-summary-sets')).toBeNull()
        expect(screen.queryByTestId('strength-records')).toBeNull()
    })

    it('adds 1RM and volume records to the weight record from our own comparison', () => {
        renderStrength([
            {
                key: '501',
                previous: { localDate: '2026-11-09', topSetKg: 80, topSetReps: 3, volumeKg: 900 },
                bestPriorTopSetKg: 80,
                bestPriorE1rmKg: 85,
                bestPriorVolumeKg: 1000,
            },
        ])

        // Top set 80 does not beat 80, but the 1RM (93.3 over 85) and volume (1,560 over 1,000) do.
        expect(screen.queryByTestId('strength-record-1-weight')).toBeNull()
        expect(screen.getByTestId('strength-record-1-e1rm-value')).toHaveTextContent('93.3 kg')
        expect(screen.getByTestId('strength-record-1-e1rm-delta')).toHaveTextContent('+8.3 kg')
        expect(screen.getByTestId('strength-record-1-volume-value')).toHaveTextContent('1,560 kg')
        expect(screen.getByTestId('strength-records-count')).toHaveTextContent('2')
        expect(screen.getByTestId('strength-exercise-1-record')).toHaveTextContent(
            'Record: 1RM, Volume'
        )
    })
})

describe('strength workout records from Lyfta', () => {
    const lyftaSets: StrengthSetDTO[] = [
        { ...set('Skull Crusher', '1511', 1, 1, 10, 10) },
        {
            ...set('Skull Crusher', '1511', 1, 2, 9, 15),
            lyftaRecords: [
                { type: 1, level: 1, value: 20 },
                { type: 3, level: 1, value: 135 },
            ],
        },
        {
            ...set('Pushdown', '107', 2, 1, 7, 50),
            lyftaRecords: [{ type: 1, level: 3, value: 62 }],
        },
    ]

    const renderLyfta = () =>
        render(
            <ActivityView
                activity={makeActivity({ category: 'strength', source: 'lyfta' })}
                laps={[]}
                strengthSets={lyftaSets}
                strengthComparisons={[]}
            />
        )

    it('lists the records Lyfta flagged, with the set that broke each one', () => {
        renderLyfta()

        expect(screen.getByTestId('strength-records-count')).toHaveTextContent('3')
        expect(screen.getByTestId('strength-record-1-name')).toHaveTextContent('Skull Crusher')
        expect(screen.getByTestId('strength-record-1-e1rm-value')).toHaveTextContent('20 kg')
        expect(screen.getByTestId('strength-record-1-e1rm-set')).toHaveTextContent('15 kg x 9')
        expect(screen.getByTestId('strength-record-1-set-volume-value')).toHaveTextContent('135 kg')
        expect(screen.getByTestId('strength-record-2-name')).toHaveTextContent('Pushdown')
        expect(screen.getByTestId('strength-record-2-e1rm-value')).toHaveTextContent('62 kg')
        // Lyfta does not say how much the old record was beaten by.
        expect(screen.queryByTestId('strength-record-1-e1rm-delta')).toBeNull()
    })

    it('marks the set that broke a record and the exercise header', () => {
        renderLyfta()

        expect(screen.queryByTestId('strength-exercise-1-set-1-record')).toBeNull()
        expect(screen.getByTestId('strength-exercise-1-set-2-record')).toHaveTextContent(
            '1RM, Set volume'
        )
        expect(screen.getByTestId('strength-exercise-1-record')).toHaveTextContent(
            'Record: 1RM, Set volume'
        )
        expect(screen.getByTestId('strength-exercise-2-set-1-record')).toHaveTextContent('1RM')
    })

    it('says there are no new records for a Lyfta workout without any, even with no history', () => {
        render(
            <ActivityView
                activity={makeActivity({ category: 'strength', source: 'lyfta' })}
                laps={[]}
                strengthSets={[set('Row', '502', 1, 1, 10, 60)]}
                strengthComparisons={[]}
            />
        )

        expect(screen.getByTestId('strength-records-empty')).toBeInTheDocument()
    })

    it('ignores the record type it has not seen and never uses our comparison for Lyfta', () => {
        render(
            <ActivityView
                activity={makeActivity({ category: 'strength', source: 'lyfta' })}
                laps={[]}
                strengthSets={[
                    {
                        ...set('Row', '502', 1, 1, 10, 60),
                        lyftaRecords: [{ type: 2, level: 1, value: 60 }],
                    },
                ]}
                strengthComparisons={[
                    {
                        key: '502',
                        previous: {
                            localDate: '2026-11-09',
                            topSetKg: 10,
                            topSetReps: 5,
                            volumeKg: 50,
                        },
                        bestPriorTopSetKg: 10,
                        bestPriorE1rmKg: 10,
                        bestPriorVolumeKg: 10,
                    },
                ]}
            />
        )

        expect(screen.queryByTestId('strength-record-1')).toBeNull()
        expect(screen.queryByTestId('strength-exercise-1-record')).toBeNull()
        expect(screen.getByTestId('strength-records-empty')).toBeInTheDocument()
    })
})
