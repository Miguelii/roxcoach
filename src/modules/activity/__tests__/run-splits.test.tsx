import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RunSplits } from '@/modules/activity/run-splits'
import { makeLap } from '@/modules/calendar/__tests__/fixtures'

const laps = [
    makeLap({ lapIndex: 1, movingTimeS: 375, avgHr: 140 }),
    makeLap({ lapIndex: 2, movingTimeS: 313, avgHr: 152 }),
    makeLap({ lapIndex: 3, movingTimeS: 330, avgHr: 158 }),
    makeLap({ lapIndex: 4, distanceM: 500, movingTimeS: 165, avgHr: 161 }),
]

describe('RunSplits', () => {
    it('numbers kilometers from 1 even when lap indexes start at 0', () => {
        render(
            <RunSplits
                laps={[
                    makeLap({ lapIndex: 0 }),
                    makeLap({ lapIndex: 1 }),
                    makeLap({ lapIndex: 2 }),
                ]}
            />
        )

        expect(screen.getByTestId('split-0-km')).toHaveTextContent('1')
        expect(screen.getByTestId('split-2-km')).toHaveTextContent('3')
    })

    it('lists splits with pace, a bar per split and the short last split distance', () => {
        render(<RunSplits laps={laps} />)

        expect(screen.getByTestId('split-1-km')).toHaveTextContent('1')
        expect(screen.getByTestId('split-4-km')).toHaveTextContent('0.5')
        expect(screen.getByTestId('split-1-pace')).toHaveTextContent('6:15')
        expect(screen.getByTestId('split-2-pace')).toHaveTextContent('5:13')
        expect(screen.getByTestId('split-4-km')).toHaveTextContent('0.5')
        expect(screen.getByTestId('split-4-pace')).toHaveTextContent('5:30')
        expect(screen.getByTestId('split-2-hr')).toHaveTextContent('152')
        // The fastest split has the longest bar.
        expect(screen.getByTestId('split-2-bar')).toHaveStyle({ width: '100%' })
        expect(screen.getByTestId('split-1-bar')).toHaveStyle({ width: '28%' })
    })

    it('renders the pace and heart rate charts', () => {
        render(<RunSplits laps={laps} />)

        expect(screen.getByTestId('run-pace-chart')).toBeInTheDocument()
        expect(screen.getByTestId('run-hr-chart')).toBeInTheDocument()
    })

    it('omits the heart rate chart without heart rate and ignores stations', () => {
        render(
            <RunSplits
                laps={[
                    ...laps.map((lap) => ({ ...lap, avgHr: null })),
                    makeLap({ lapIndex: 5, station: 'ski_erg' }),
                ]}
            />
        )

        expect(screen.queryByTestId('run-hr-chart')).toBeNull()
        expect(screen.queryByTestId('split-5')).toBeNull()
    })

    it('renders nothing without usable laps', () => {
        render(<RunSplits laps={[makeLap({ distanceM: null })]} />)

        expect(screen.queryByTestId('run-splits')).toBeNull()
    })
})
