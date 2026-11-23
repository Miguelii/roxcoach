import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { IntegrationDangerZone } from '@/components/integration-danger-zone'

type Overrides = Partial<React.ComponentProps<typeof IntegrationDangerZone>>

const renderZone = (overrides: Overrides = {}) => {
    const onClear = vi.fn()
    const onDisconnect = vi.fn()
    render(
        <IntegrationDangerZone
            provider="Lyfta"
            items="workouts"
            count={5}
            disabled={false}
            onClear={onClear}
            onDisconnect={onDisconnect}
            testIdPrefix="lyfta"
            {...overrides}
        />
    )
    return { onClear, onDisconnect }
}

describe('IntegrationDangerZone', () => {
    it('shows the count in the clear explanation and calls the handlers', () => {
        const { onClear, onDisconnect } = renderZone()

        expect(screen.getByTestId('lyfta-clear-hint')).toHaveTextContent('5 workouts')
        fireEvent.click(screen.getByTestId('lyfta-clear'))
        fireEvent.click(screen.getByTestId('lyfta-disconnect'))

        expect(onClear).toHaveBeenCalledTimes(1)
        expect(onDisconnect).toHaveBeenCalledTimes(1)
    })

    it('disables clearing when there is nothing to clear', () => {
        renderZone({ count: 0 })
        expect(screen.getByTestId('lyfta-clear')).toBeDisabled()
    })

    it('disables clearing while the count is unknown', () => {
        renderZone({ count: undefined })

        expect(screen.getByTestId('lyfta-clear')).toBeDisabled()
        expect(screen.getByTestId('lyfta-clear-hint')).not.toHaveTextContent('undefined')
    })

    it('disables both actions while something else is running', () => {
        renderZone({ disabled: true })

        expect(screen.getByTestId('lyfta-clear')).toBeDisabled()
        expect(screen.getByTestId('lyfta-disconnect')).toBeDisabled()
    })
})
