import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RaceFormDialog } from '@/modules/races/race-form-dialog'
import { raceToFormValues } from '@/modules/races/use-race-form'
import { HYROX_RACE, RUN_RACE, TODAY } from '@/modules/races/__tests__/fixtures'

const change = (id: string, value: string) =>
    fireEvent.change(screen.getByTestId(id), { target: { value } })

describe('RaceFormDialog', () => {
    it('create mode starts empty with the profile division and hides the distance', () => {
        render(
            <RaceFormDialog
                mode="create"
                defaults={null}
                today={TODAY}
                defaultDivision="pro_men"
                open
                onOpenChange={vi.fn()}
                onSubmit={vi.fn()}
            />
        )
        expect(screen.getByTestId('race-form-name')).toHaveValue('')
        expect(screen.getByTestId('race-form-division')).toHaveTextContent('Pro Men')
        expect(screen.queryByTestId('race-form-distance')).not.toBeInTheDocument()
        expect(screen.getByTestId('race-form-submit')).toHaveTextContent('Add race')
    })

    it('edit mode shows the race values and the distance for running', () => {
        render(
            <RaceFormDialog
                mode="edit"
                defaults={raceToFormValues(RUN_RACE)}
                today={TODAY}
                defaultDivision={null}
                open
                onOpenChange={vi.fn()}
                onSubmit={vi.fn()}
            />
        )
        expect(screen.getByTestId('race-form-name')).toHaveValue('Sao Silvestre')
        expect(screen.getByTestId('race-form-distance')).toHaveValue('10')
        expect(screen.getByTestId('race-form-goal')).toHaveValue('40:00')
        expect(screen.queryByTestId('race-form-division')).not.toBeInTheDocument()
        expect(screen.getByTestId('race-form-submit')).toHaveTextContent('Save race')
    })

    it('shows errors and does not submit when invalid', async () => {
        const onSubmit = vi.fn()
        render(
            <RaceFormDialog
                mode="create"
                defaults={null}
                today={TODAY}
                defaultDivision={null}
                open
                onOpenChange={vi.fn()}
                onSubmit={onSubmit}
            />
        )
        fireEvent.click(screen.getByTestId('race-form-submit'))
        expect(await screen.findByTestId('race-form-name-error')).toBeInTheDocument()
        expect(screen.getByTestId('race-form-date-error')).toBeInTheDocument()
        expect(screen.getByTestId('race-form-division-error')).toBeInTheDocument()
        expect(screen.getByTestId('race-form-goal-error')).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it('rejects a date that is today', async () => {
        const onSubmit = vi.fn()
        render(
            <RaceFormDialog
                mode="edit"
                defaults={raceToFormValues(HYROX_RACE)}
                today={TODAY}
                defaultDivision={null}
                open
                onOpenChange={vi.fn()}
                onSubmit={onSubmit}
            />
        )
        change('race-form-date', TODAY)
        fireEvent.click(screen.getByTestId('race-form-submit'))
        expect(await screen.findByTestId('race-form-date-error')).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it('submits the converted input and closes', async () => {
        const onSubmit = vi.fn().mockResolvedValue(null)
        const onOpenChange = vi.fn()
        render(
            <RaceFormDialog
                mode="edit"
                defaults={raceToFormValues(HYROX_RACE)}
                today={TODAY}
                defaultDivision={null}
                open
                onOpenChange={onOpenChange}
                onSubmit={onSubmit}
            />
        )
        change('race-form-location', '  ')
        change('race-form-goal', '1:09:30')
        fireEvent.click(screen.getByTestId('race-form-submit'))
        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
        expect(onSubmit).toHaveBeenCalledWith({
            name: 'Hyrox Lisbon',
            raceType: 'hyrox',
            raceDate: '2027-01-01',
            location: null,
            distanceM: null,
            hyroxDivision: 'open_men',
            targetTimeS: 4170,
            priority: 'A',
            notes: 'Bring grips',
        })
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    })

    it('stays open when saving fails', async () => {
        const onOpenChange = vi.fn()
        render(
            <RaceFormDialog
                mode="edit"
                defaults={raceToFormValues(HYROX_RACE)}
                today={TODAY}
                defaultDivision={null}
                open
                onOpenChange={onOpenChange}
                onSubmit={vi.fn().mockRejectedValue(new Error('boom'))}
            />
        )
        fireEvent.click(screen.getByTestId('race-form-submit'))
        await waitFor(() => expect(screen.getByTestId('race-form-submit')).not.toBeDisabled())
        expect(onOpenChange).not.toHaveBeenCalled()
    })
})
