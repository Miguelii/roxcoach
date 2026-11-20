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

    it('renders imported strength sets as read-only data', () => {
        render(
            <ActivityView
                activity={makeActivity({ category: 'strength', source: 'lyfta' })}
                laps={[]}
                strengthSets={[
                    {
                        exercise: 'Bench Press',
                        sourceExerciseId: '501',
                        setIndex: 1,
                        reps: 5,
                        loadKg: 80,
                        rir: 2,
                        rpe: null,
                    },
                    {
                        exercise: 'Deadlift',
                        sourceExerciseId: '502',
                        setIndex: 2,
                        reps: null,
                        loadKg: null,
                        rir: null,
                        rpe: null,
                    },
                ]}
            />
        )

        expect(screen.getByTestId('strength-sets-table')).toBeTruthy()
        expect(screen.getByTestId('strength-set-1-exercise')).toHaveTextContent('Bench Press')
        expect(screen.getByTestId('strength-set-1-reps')).toHaveTextContent('5')
        expect(screen.getByTestId('strength-set-1-load')).toHaveTextContent('80 kg')
        expect(screen.getByTestId('strength-set-2-reps')).toHaveTextContent('-')
        expect(screen.getByTestId('strength-set-2-load')).toHaveTextContent('-')
    })
})
