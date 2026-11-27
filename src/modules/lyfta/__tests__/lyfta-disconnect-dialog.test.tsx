import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { LyftaDisconnectDialog } from '@/modules/lyfta/lyfta-disconnect-dialog'

const setup = (overrides: Partial<Parameters<typeof LyftaDisconnectDialog>[0]> = {}) => {
    const onOpenChange = vi.fn()
    const onConfirm = vi.fn()
    render(
        <LyftaDisconnectDialog
            open
            onOpenChange={onOpenChange}
            onConfirm={onConfirm}
            disconnecting={false}
            {...overrides}
        />
    )
    return { onOpenChange, onConfirm }
}

describe('LyftaDisconnectDialog', () => {
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

    it('explains what stays and asks to confirm', () => {
        setup()

        expect(screen.getByTestId('lyfta-disconnect-dialog')).toHaveTextContent(
            'Imported workouts and sets will stay in your training history'
        )
        expect(screen.getByTestId('lyfta-disconnect-confirm')).toHaveTextContent('Disconnect Lyfta')
        expect(screen.getByTestId('lyfta-disconnect-cancel')).toHaveTextContent('Keep connected')
    })

    it('confirms and cancels', () => {
        const { onConfirm, onOpenChange } = setup()
        fireEvent.click(screen.getByTestId('lyfta-disconnect-confirm'))
        fireEvent.click(screen.getByTestId('lyfta-disconnect-cancel'))

        expect(onConfirm).toHaveBeenCalledTimes(1)
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('disables both buttons and shows Disconnecting... while the request runs', () => {
        setup({ disconnecting: true })

        expect(screen.getByTestId('lyfta-disconnect-confirm')).toBeDisabled()
        expect(screen.getByTestId('lyfta-disconnect-confirm')).toHaveTextContent('Disconnecting...')
        expect(screen.getByTestId('lyfta-disconnect-cancel')).toBeDisabled()
    })

    it('renders no inline error', () => {
        setup()

        expect(screen.queryByTestId('lyfta-disconnect-error')).toBeNull()
    })
})
