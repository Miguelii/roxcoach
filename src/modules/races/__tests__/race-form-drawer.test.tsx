import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RaceFormDrawer } from '@/modules/races/race-form-drawer'
import { raceToFormValues } from '@/modules/races/use-race-form'
import { HYROX_RACE, RUN_RACE, TODAY } from '@/modules/races/__tests__/fixtures'

const change = (id: string, value: string) =>
    fireEvent.change(screen.getByTestId(id), { target: { value } })

const selectOption = async (id: string) => {
    const option = await screen.findByTestId(id)
    fireEvent.pointerDown(option, { pointerType: 'mouse' })
    fireEvent.mouseUp(option)
    fireEvent.click(option)
}

describe('RaceFormDrawer', () => {
    beforeEach(() => {
        vi.stubGlobal('matchMedia', () => ({
            matches: false,
            addEventListener: () => {},
            removeEventListener: () => {},
        }))
    })

    it('create mode starts empty with the profile division and hides the distance', () => {
        render(
            <RaceFormDrawer
                mode="create"
                defaults={null}
                today={TODAY}
                defaultDivision="pro_men"
                open
                onOpenChange={vi.fn()}
                onSubmit={vi.fn()}
            />
        )
        expect(screen.getByTestId('race-form-drawer')).toHaveAttribute(
            'data-vaul-drawer-direction',
            'right'
        )
        expect(screen.getByTestId('race-form-name')).toHaveValue('')
        expect(screen.getByTestId('race-form-division')).toHaveTextContent('Pro Men')
        expect(screen.queryByTestId('race-form-distance')).not.toBeInTheDocument()
        expect(screen.getByTestId('race-form-submit')).toHaveTextContent('Add race')
    })

    it('shows division only while the selected type is Hyrox', async () => {
        render(
            <RaceFormDrawer
                mode="create"
                defaults={null}
                today={TODAY}
                defaultDivision="pro_men"
                open
                onOpenChange={vi.fn()}
                onSubmit={vi.fn()}
            />
        )

        const type = screen.getByTestId('race-form-type')
        fireEvent.click(type)
        await selectOption('race-form-type-option-running')
        await waitFor(() => expect(type).toHaveTextContent('Running'))
        expect(screen.queryByTestId('race-form-division')).not.toBeInTheDocument()

        fireEvent.click(type)
        await selectOption('race-form-type-option-hyrox')
        await waitFor(() => expect(type).toHaveTextContent('Hyrox'))
        expect(screen.getByTestId('race-form-division')).toBeInTheDocument()

        fireEvent.click(type)
        await selectOption('race-form-type-option-other')
        await waitFor(() => expect(type).toHaveTextContent('Other'))
        expect(screen.queryByTestId('race-form-division')).not.toBeInTheDocument()
    })

    it('edit mode shows the race values and the distance for running', () => {
        render(
            <RaceFormDrawer
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

    it('uses a bottom sheet on mobile', () => {
        vi.stubGlobal('matchMedia', () => ({
            matches: true,
            addEventListener: () => {},
            removeEventListener: () => {},
        }))

        render(
            <RaceFormDrawer
                mode="create"
                defaults={null}
                today={TODAY}
                defaultDivision={null}
                open
                onOpenChange={vi.fn()}
                onSubmit={vi.fn()}
            />
        )

        expect(screen.getByTestId('race-form-drawer')).toHaveAttribute(
            'data-vaul-drawer-direction',
            'bottom'
        )
    })

    it('shows errors and does not submit when invalid', async () => {
        const onSubmit = vi.fn()
        render(
            <RaceFormDrawer
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
            <RaceFormDrawer
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
            <RaceFormDrawer
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
            <RaceFormDrawer
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
