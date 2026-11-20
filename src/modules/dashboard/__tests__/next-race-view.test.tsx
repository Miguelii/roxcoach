import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextRaceView } from '@/modules/dashboard/next-race-view'
import { HYROX_RACE, TODAY } from '@/modules/races/__tests__/fixtures'

describe('NextRaceView', () => {
    it('shows the name, days to go, goal and priority, linking to /races', () => {
        render(<NextRaceView race={HYROX_RACE} today={TODAY} />)

        expect(screen.getByTestId('next-race')).toHaveAttribute('href', '/races')
        expect(screen.getByTestId('next-race-name')).toHaveTextContent('Hyrox Lisbon')
        expect(screen.getByTestId('next-race-days')).toHaveTextContent('42 days to go')
        expect(screen.getByTestId('next-race-goal')).toHaveTextContent('Goal 1:10:00')
        expect(screen.getByTestId('next-race-priority')).toHaveTextContent('Target race')
    })

    it('renders nothing without a race', () => {
        render(<NextRaceView race={null} today={TODAY} />)

        expect(screen.queryByTestId('next-race')).not.toBeInTheDocument()
    })
})
