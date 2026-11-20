import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RacesList } from '@/modules/races/races-list'
import type { RaceDTO } from '@/_bff/modules/races/types'
import {
    CANCELLED_RACE,
    DONE_RACE,
    HYROX_RACE,
    RUN_RACE,
    TODAY,
} from '@/modules/races/__tests__/fixtures'

const setup = (races: RaceDTO[]) => {
    const handlers = {
        onCreate: vi.fn().mockResolvedValue(null),
        onUpdate: vi.fn().mockResolvedValue(null),
        onComplete: vi.fn().mockResolvedValue(null),
        onCancel: vi.fn().mockResolvedValue(null),
        onDelete: vi.fn().mockResolvedValue(null),
    }
    render(<RacesList races={races} today={TODAY} defaultDivision="open_men" {...handlers} />)
    return handlers
}

describe('RacesList', () => {
    it('shows the empty state with the New race button', () => {
        setup([])
        expect(screen.getByTestId('races-empty')).toHaveTextContent(
            'No races yet. Add one to get a coach plan.'
        )
        expect(screen.getByTestId('race-new')).toHaveTextContent('New race')
        expect(screen.queryByTestId('races-history')).not.toBeInTheDocument()
    })

    it('lists upcoming races by date', () => {
        setup([HYROX_RACE, RUN_RACE])
        expect(screen.queryByTestId('races-empty')).not.toBeInTheDocument()
        const ids = screen
            .getAllByTestId(/^race-card-/u)
            .map((node) => node.getAttribute('data-testid'))
        expect(ids).toEqual(['race-card-r-run', 'race-card-r-hyrox'])
    })

    it('keeps completed and cancelled races in a collapsed history, newest first', () => {
        setup([RUN_RACE, DONE_RACE, CANCELLED_RACE])
        const history = screen.getByTestId('races-history')
        expect(history).not.toHaveAttribute('open')
        expect(history).toHaveTextContent('History (2)')
        const ids = Array.from(history.querySelectorAll('[data-testid^="race-card-"]')).map(
            (node) => node.getAttribute('data-testid')
        )
        expect(ids).toEqual(['race-card-r-cancelled', 'race-card-r-done'])
        expect(screen.getByTestId('races-upcoming')).not.toContainElement(
            screen.getByTestId('race-card-r-cancelled')
        )
    })

    it('creates a race through the dialog', async () => {
        const handlers = setup([])
        fireEvent.click(screen.getByTestId('race-new'))
        expect(await screen.findByTestId('race-form-division')).toHaveTextContent('Open Men')
        fireEvent.change(screen.getByTestId('race-form-name'), { target: { value: 'Hyrox Porto' } })
        fireEvent.change(screen.getByTestId('race-form-date'), { target: { value: '2027-02-01' } })
        fireEvent.change(screen.getByTestId('race-form-goal'), { target: { value: '1:10:00' } })
        fireEvent.click(screen.getByTestId('race-form-submit'))
        await waitFor(() => expect(handlers.onCreate).toHaveBeenCalledTimes(1))
        expect(handlers.onCreate).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Hyrox Porto', targetTimeS: 4200 })
        )
    })

    it('edits a race through the dialog', async () => {
        const handlers = setup([HYROX_RACE])
        fireEvent.click(screen.getByTestId('race-edit-r-hyrox'))
        expect(await screen.findByTestId('race-form-name')).toHaveValue('Hyrox Lisbon')
        fireEvent.click(screen.getByTestId('race-form-submit'))
        await waitFor(() => expect(handlers.onUpdate).toHaveBeenCalledTimes(1))
        expect(handlers.onUpdate).toHaveBeenCalledWith(
            'r-hyrox',
            expect.objectContaining({ name: 'Hyrox Lisbon' })
        )
    })

    it('completes a race through the dialog', async () => {
        const handlers = setup([RUN_RACE])
        fireEvent.click(screen.getByTestId('race-complete-r-run'))
        fireEvent.change(await screen.findByTestId('complete-result'), {
            target: { value: '39:30' },
        })
        fireEvent.click(screen.getByTestId('complete-submit'))
        await waitFor(() => expect(handlers.onComplete).toHaveBeenCalledWith('r-run', 2370))
    })

    it('cancels and deletes by id after the confirmation', async () => {
        const handlers = setup([RUN_RACE, CANCELLED_RACE])
        fireEvent.click(screen.getByTestId('race-cancel-r-run'))
        fireEvent.click(screen.getByTestId('race-confirm-yes-r-run'))
        await waitFor(() => expect(handlers.onCancel).toHaveBeenCalledWith('r-run'))
        fireEvent.click(screen.getByTestId('race-delete-r-cancelled'))
        fireEvent.click(screen.getByTestId('race-confirm-yes-r-cancelled'))
        await waitFor(() => expect(handlers.onDelete).toHaveBeenCalledWith('r-cancelled'))
    })
})
