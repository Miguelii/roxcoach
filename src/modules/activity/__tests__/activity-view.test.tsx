import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActivityView } from '@/modules/activity/activity-view'
import { makeActivity, makeLap } from '@/modules/calendar/__tests__/fixtures'

describe('ActivityView', () => {
    it('shows the metrics that are present and omits the null ones', () => {
        render(
            <ActivityView
                activity={makeActivity({ avgHr: 150, perceivedEffort: 7 })}
                laps={[]}
                strengthSets={[]}
            />
        )

        expect(screen.getByTestId('activity-name')).toHaveTextContent('Easy run')
        expect(screen.getByTestId('metric-time-value')).toHaveTextContent('45m')
        expect(screen.getByTestId('metric-distance-value')).toHaveTextContent('8.0 km')
        expect(screen.getByTestId('metric-pace-value')).toHaveTextContent('5:38 /km')
        expect(screen.getByTestId('metric-avg-hr-value')).toHaveTextContent('150 bpm')
        expect(screen.getByTestId('metric-effort-value')).toHaveTextContent('7 / 10')
        expect(screen.queryByTestId('metric-max-hr-value')).toBeNull()
        expect(screen.getByTestId('activity-metrics')).not.toHaveTextContent('N/A')
    })

    it('renders the laps table with station tags and dashes for missing values', () => {
        render(
            <ActivityView
                activity={makeActivity({ category: 'hyrox' })}
                laps={[
                    makeLap({ lapIndex: 1, movingTimeS: 295, distanceM: 1000 }),
                    makeLap({ lapIndex: 2, station: 'ski_erg', movingTimeS: 240 }),
                ]}
                strengthSets={[]}
            />
        )

        expect(screen.getByTestId('lap-1-segment')).toHaveTextContent('1.0 km')
        expect(screen.getByTestId('lap-1-pace')).toHaveTextContent('4:55 /km')
        expect(screen.getByTestId('lap-1-hr')).toHaveTextContent('-')
        expect(screen.getByTestId('lap-2-station')).toHaveTextContent('SkiErg')
        expect(screen.getByTestId('lap-2-pace')).toHaveTextContent('-')
        expect(screen.getByTestId('lap-2-time')).toHaveTextContent('4:00')
    })

    it('omits the laps section without laps', () => {
        render(<ActivityView activity={makeActivity()} laps={[]} strengthSets={[]} />)

        expect(screen.queryByTestId('laps-table')).toBeNull()
    })

    it('shows strength metrics and groups sets in exercise and set order', () => {
        render(
            <ActivityView
                activity={makeActivity({
                    category: 'strength',
                    source: 'lyfta',
                    bodyWeightKg: 72.5,
                    lyftaTotalVolumeKgReps: 1230,
                })}
                laps={[]}
                strengthSets={[
                    {
                        exercise: 'Deadlift',
                        exerciseIndex: 2,
                        exerciseImageUrl: null,
                        sourceExerciseId: '502',
                        setIndex: 1,
                        reps: 5,
                        loadKg: 100,
                        rir: null,
                        rpe: null,
                    },
                    {
                        exercise: 'Bench Press',
                        exerciseIndex: 1,
                        exerciseImageUrl: 'https://lyfta.app/images/exercises/00251101.png',
                        sourceExerciseId: '501',
                        setIndex: 2,
                        reps: 4,
                        loadKg: 82.5,
                        rir: null,
                        rpe: null,
                    },
                    {
                        exercise: 'Bench Press',
                        exerciseIndex: 1,
                        exerciseImageUrl: 'https://lyfta.app/images/exercises/00251101.png',
                        sourceExerciseId: '501',
                        setIndex: 1,
                        reps: 5,
                        loadKg: 80,
                        rir: 2,
                        rpe: null,
                    },
                ]}
            />
        )

        expect(screen.getByTestId('metric-time-value')).toHaveTextContent('45m')
        expect(screen.getByTestId('metric-volume-value')).toHaveTextContent('1,230 kg x reps')
        expect(screen.getByTestId('metric-body-weight-value')).toHaveTextContent('72.5 kg')
        expect(screen.getByTestId('strength-exercise-1-name')).toHaveTextContent('Bench Press')
        expect(screen.getByTestId('strength-exercise-2-name')).toHaveTextContent('Deadlift')
        expect(screen.getByTestId('strength-exercise-1-image')).toHaveAttribute(
            'alt',
            'Bench Press demonstration'
        )
        expect(screen.getByTestId('strength-exercise-2-image-placeholder')).toBeTruthy()
        expect(screen.getByTestId('strength-exercise-1-set-1-reps')).toHaveTextContent('5')
        expect(screen.getByTestId('strength-exercise-1-set-1-load')).toHaveTextContent('80 kg')
        expect(screen.getByTestId('strength-exercise-1-set-2-reps')).toHaveTextContent('4')
        expect(screen.getByTestId('strength-exercise-1-set-2-rir')).toHaveTextContent('-')
        expect(screen.getByTestId('strength-exercise-2-set-1-load')).toHaveTextContent('100 kg')
        expect(screen.getByTestId('strength-exercise-1-set-1-rir')).toHaveTextContent('RIR 2')
    })

    it('uses an alphabetical fallback for legacy sets without exercise order', () => {
        render(
            <ActivityView
                activity={makeActivity({ category: 'strength' })}
                laps={[]}
                strengthSets={[
                    {
                        exercise: 'Goblet Squat',
                        exerciseIndex: null,
                        exerciseImageUrl: null,
                        sourceExerciseId: null,
                        setIndex: 1,
                        reps: 10,
                        loadKg: 20,
                        rir: null,
                        rpe: null,
                    },
                    {
                        exercise: 'Arnold Press',
                        exerciseIndex: null,
                        exerciseImageUrl: null,
                        sourceExerciseId: null,
                        setIndex: 1,
                        reps: 8,
                        loadKg: 12,
                        rir: null,
                        rpe: null,
                    },
                ]}
            />
        )

        expect(screen.getByTestId('strength-exercise-1-name')).toHaveTextContent('Arnold Press')
        expect(screen.getByTestId('strength-exercise-2-name')).toHaveTextContent('Goblet Squat')
        expect(screen.getByTestId('metric-volume-value')).toHaveTextContent('296 kg x reps')
        expect(screen.queryByTestId('strength-exercise-1-set-1-rir')).toBeNull()
    })

    it('shows an honest empty state when a strength activity has no set data', () => {
        render(
            <ActivityView
                activity={makeActivity({ category: 'strength' })}
                laps={[]}
                strengthSets={[]}
            />
        )

        expect(screen.getByTestId('strength-sets-empty')).toHaveTextContent(
            'No set data recorded for this strength workout.'
        )
        expect(screen.queryByTestId('metric-volume-value')).toBeNull()
    })

    it('does not estimate volume when a set is missing reps or load', () => {
        render(
            <ActivityView
                activity={makeActivity({ category: 'strength' })}
                laps={[]}
                strengthSets={[
                    {
                        exercise: 'Bench Press',
                        exerciseIndex: 1,
                        exerciseImageUrl: null,
                        sourceExerciseId: '501',
                        setIndex: 1,
                        reps: 5,
                        loadKg: 80,
                        rir: null,
                        rpe: null,
                    },
                    {
                        exercise: 'Bench Press',
                        exerciseIndex: 1,
                        exerciseImageUrl: null,
                        sourceExerciseId: '501',
                        setIndex: 2,
                        reps: null,
                        loadKg: 80,
                        rir: null,
                        rpe: null,
                    },
                ]}
            />
        )

        expect(screen.queryByTestId('metric-volume-value')).toBeNull()
    })
})
