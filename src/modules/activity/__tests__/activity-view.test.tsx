import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActivityView } from '@/modules/activity/activity-view'
import { makeActivity, makeLap } from '@/modules/calendar/__tests__/fixtures'

describe('ActivityView', () => {
    it('shows the metrics that are present and omits the null ones', () => {
        render(
            <ActivityView activity={makeActivity({ avgHr: 150, perceivedEffort: 7 })} laps={[]} />
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

    it('links to Strava only for Strava activities', () => {
        const { rerender } = render(<ActivityView activity={makeActivity()} laps={[]} />)

        expect(screen.getByTestId('strava-link')).toHaveAttribute(
            'href',
            'https://www.strava.com/activities/123456'
        )

        rerender(
            <ActivityView activity={makeActivity({ source: 'manual', stravaId: null })} laps={[]} />
        )

        expect(screen.queryByTestId('strava-link')).toBeNull()
    })

    it('renders the laps table with station tags and dashes for missing values', () => {
        render(
            <ActivityView
                activity={makeActivity({ category: 'hyrox' })}
                laps={[
                    makeLap({ lapIndex: 1, movingTimeS: 295, distanceM: 1000 }),
                    makeLap({ lapIndex: 2, station: 'ski_erg', movingTimeS: 240 }),
                ]}
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
        render(<ActivityView activity={makeActivity()} laps={[]} />)

        expect(screen.queryByTestId('laps-table')).toBeNull()
    })
})
