import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RaceCardView } from '@/modules/races/race-card-view'
import {
    CANCELLED_RACE,
    DONE_RACE,
    HYROX_RACE,
    RUN_RACE,
    TODAY,
} from '@/modules/races/__tests__/fixtures'
import type { RaceDTO } from '@/_bff/modules/races/types'

const setup = (race: RaceDTO) => {
    const handlers = {
        onEdit: vi.fn(),
        onComplete: vi.fn(),
        onCancel: vi.fn().mockResolvedValue(null),
        onDelete: vi.fn().mockResolvedValue(null),
    }
    render(<RaceCardView race={race} today={TODAY} {...handlers} />)
    return handlers
}

describe('RaceCardView', () => {
    beforeEach(() => {
        // jsdom has no matchMedia; the confirm dialog reads it through useIsMobile (desktop here).
        vi.stubGlobal('matchMedia', () => ({
            matches: false,
            addEventListener: () => {},
            removeEventListener: () => {},
        }))
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('shows the main facts of an upcoming hyrox race', () => {
        setup(HYROX_RACE)
        expect(screen.getByTestId('race-card-r-hyrox')).toHaveTextContent('Hyrox Lisbon')
        expect(screen.getByTestId('race-card-r-hyrox')).toHaveTextContent('Fri, 1 Jan 2027')
        expect(screen.getByTestId('race-days-r-hyrox')).toHaveTextContent('42 days to go')
        expect(screen.getByTestId('race-goal-r-hyrox')).toHaveTextContent('Goal 1:10:00')
        expect(screen.getByTestId('race-type-r-hyrox')).toHaveTextContent('Hyrox (Open Men)')
        expect(screen.getByTestId('race-priority-r-hyrox')).toHaveTextContent('Target race')
        expect(screen.getByTestId('race-location-r-hyrox')).toHaveTextContent('Lisbon')
        expect(screen.getByTestId('race-notes-r-hyrox')).toHaveTextContent('Bring grips')
        expect(screen.queryByTestId('race-pace-r-hyrox')).not.toBeInTheDocument()
    })

    it('shows the required pace and the tune-up chip for a running race', () => {
        setup(RUN_RACE)
        expect(screen.getByTestId('race-pace-r-run')).toHaveTextContent('Required pace 4:00 /km')
        expect(screen.getByTestId('race-priority-r-run')).toHaveTextContent('Tune-up')
    })

    it('renders nothing for a null location or notes, and never N/A', () => {
        setup(RUN_RACE)
        expect(screen.queryByTestId('race-location-r-run')).not.toBeInTheDocument()
        expect(screen.queryByTestId('race-notes-r-run')).not.toBeInTheDocument()
        expect(screen.getByTestId('race-card-r-run').textContent).not.toContain('N/A')
    })

    it('shows the result and a slower delta for a completed race', () => {
        setup(DONE_RACE)
        expect(screen.getByTestId('race-result-r-done')).toHaveTextContent('Result 41:42')
        expect(screen.getByTestId('race-delta-r-done')).toHaveTextContent('1:42 slower than goal')
        expect(screen.queryByTestId('race-days-r-done')).not.toBeInTheDocument()
    })

    it('shows a faster delta', () => {
        setup({ ...DONE_RACE, resultTimeS: 2340 })
        expect(screen.getByTestId('race-delta-r-done')).toHaveTextContent('1:00 faster than goal')
    })

    it('has no actions but no Delete when a result exists', () => {
        setup(DONE_RACE)
        expect(screen.queryByTestId('race-delete-r-done')).not.toBeInTheDocument()
        expect(screen.queryByTestId('race-edit-r-done')).not.toBeInTheDocument()
        expect(screen.queryByTestId('race-complete-r-done')).not.toBeInTheDocument()
        expect(screen.queryByTestId('race-cancel-r-done')).not.toBeInTheDocument()
    })

    it('calls Edit and Complete directly', () => {
        const raced = { ...HYROX_RACE, raceDate: TODAY }
        const handlers = setup(raced)
        fireEvent.click(screen.getByTestId('race-edit-r-hyrox'))
        fireEvent.click(screen.getByTestId('race-complete-r-hyrox'))
        expect(handlers.onEdit).toHaveBeenCalledWith(raced)
        expect(handlers.onComplete).toHaveBeenCalledWith(raced)
    })

    it('offers Complete only when the race date is today or earlier', () => {
        setup(HYROX_RACE)
        expect(screen.getByTestId('race-edit-r-hyrox')).toBeInTheDocument()
        expect(screen.queryByTestId('race-complete-r-hyrox')).not.toBeInTheDocument()
    })

    it('asks before cancelling with context, and keeping it does nothing', () => {
        const handlers = setup(HYROX_RACE)
        fireEvent.click(screen.getByTestId('race-cancel-r-hyrox'))
        expect(handlers.onCancel).not.toHaveBeenCalled()
        expect(screen.getByTestId('race-confirm-dialog-r-hyrox')).toHaveTextContent(
            'Cancel Hyrox Lisbon?'
        )
        expect(screen.getByTestId('race-confirm-dialog-r-hyrox')).toHaveTextContent(
            'This moves the race to your history.'
        )
        expect(screen.getByTestId('race-confirm-dialog-r-hyrox')).toHaveAttribute(
            'role',
            'alertdialog'
        )
        fireEvent.click(screen.getByTestId('race-confirm-no-r-hyrox'))
        expect(handlers.onCancel).not.toHaveBeenCalled()
        expect(screen.queryByTestId('race-confirm-dialog-r-hyrox')).not.toBeInTheDocument()
    })

    it('cancels after the confirmation', async () => {
        const handlers = setup(HYROX_RACE)
        fireEvent.click(screen.getByTestId('race-cancel-r-hyrox'))
        fireEvent.click(screen.getByTestId('race-confirm-yes-r-hyrox'))
        await waitFor(() => expect(handlers.onCancel).toHaveBeenCalledWith(HYROX_RACE))
    })

    it('warns before permanently deleting a race without a result', async () => {
        const handlers = setup(HYROX_RACE)
        fireEvent.click(screen.getByTestId('race-delete-r-hyrox'))
        expect(handlers.onDelete).not.toHaveBeenCalled()
        expect(screen.getByTestId('race-confirm-dialog-r-hyrox')).toHaveTextContent(
            'This permanently removes the race.'
        )
        expect(screen.getByTestId('race-confirm-dialog-r-hyrox')).toHaveTextContent(
            'Your coach will no longer see it'
        )
        fireEvent.click(screen.getByTestId('race-confirm-yes-r-hyrox'))
        await waitFor(() => expect(handlers.onDelete).toHaveBeenCalledWith(HYROX_RACE))
    })

    it('marks a cancelled race and offers only Delete', () => {
        setup(CANCELLED_RACE)
        expect(screen.getByTestId('race-status-r-cancelled')).toHaveTextContent('Cancelled')
        expect(screen.queryByTestId('race-days-r-cancelled')).not.toBeInTheDocument()
        expect(screen.queryByTestId('race-edit-r-cancelled')).not.toBeInTheDocument()
        expect(screen.getByTestId('race-delete-r-cancelled')).toBeInTheDocument()
    })
})
