import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ClearActivitiesDialog } from '@/components/clear-activities-dialog'

type Overrides = Partial<React.ComponentProps<typeof ClearActivitiesDialog>>

const renderDialog = (overrides: Overrides = {}) => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
        <ClearActivitiesDialog
            open
            onOpenChange={onOpenChange}
            onConfirm={onConfirm}
            clearing={false}
            error={null}
            provider="Lyfta"
            items="workouts"
            extra="sets"
            count={142}
            testIdPrefix="lyfta"
            {...overrides}
        />
    )
    return { onConfirm, onOpenChange }
}

describe('ClearActivitiesDialog', () => {
    beforeEach(() => {
        vi.stubGlobal('matchMedia', () => ({
            matches: false,
            addEventListener: () => {},
            removeEventListener: () => {},
        }))
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('names the provider and how many activities will be deleted', () => {
        renderDialog()

        expect(screen.getByTestId('lyfta-clear-dialog')).toHaveTextContent(
            'Clear 142 Lyfta workouts?'
        )
        expect(screen.getByTestId('lyfta-clear-description')).toHaveTextContent('with their sets')
        expect(screen.getByTestId('lyfta-clear-description')).toHaveTextContent('last 360 days')
        expect(screen.getByTestId('lyfta-clear-confirm')).toHaveTextContent(
            'Clear Lyfta activities'
        )
        expect(screen.getByTestId('lyfta-clear-cancel')).toHaveTextContent('Keep activities')
    })

    it('uses the singular for one activity and the provider items for Zepp', () => {
        renderDialog({
            provider: 'Zepp',
            items: 'runs',
            extra: 'laps',
            count: 1,
            testIdPrefix: 'zepp',
        })

        expect(screen.getByTestId('zepp-clear-dialog')).toHaveTextContent('Clear 1 Zepp run?')
        expect(screen.getByTestId('zepp-clear-description')).toHaveTextContent('with their laps')
    })

    it('confirms from the confirm button and cancels from the cancel button', () => {
        const { onConfirm, onOpenChange } = renderDialog()

        fireEvent.click(screen.getByTestId('lyfta-clear-confirm'))
        fireEvent.click(screen.getByTestId('lyfta-clear-cancel'))

        expect(onConfirm).toHaveBeenCalledTimes(1)
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('disables the confirm button and says it is clearing while it runs', () => {
        renderDialog({ clearing: true })

        expect(screen.getByTestId('lyfta-clear-confirm')).toBeDisabled()
        expect(screen.getByTestId('lyfta-clear-confirm')).toHaveTextContent('Clearing...')
    })

    it('shows why the last attempt failed', () => {
        renderDialog({ error: 'A Lyfta sync is already running' })

        expect(screen.getByTestId('lyfta-clear-error')).toHaveTextContent(
            'A Lyfta sync is already running'
        )
    })
})
