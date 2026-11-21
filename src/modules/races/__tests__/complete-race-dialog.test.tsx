import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CompleteRaceDialog } from '@/modules/races/complete-race-dialog'
import { RUN_RACE } from '@/modules/races/__tests__/fixtures'

const setup = (onSubmit = vi.fn().mockResolvedValue(null)) => {
    const onOpenChange = vi.fn()
    render(
        <CompleteRaceDialog race={RUN_RACE} open onOpenChange={onOpenChange} onSubmit={onSubmit} />
    )
    return { onSubmit, onOpenChange }
}

describe('CompleteRaceDialog', () => {
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

    it('shows the goal and no delta before typing', () => {
        setup()
        expect(screen.getByTestId('complete-goal')).toHaveTextContent('Goal 40:00')
        expect(screen.queryByTestId('complete-delta')).not.toBeInTheDocument()
    })

    it('shows the delta while typing', () => {
        setup()
        fireEvent.change(screen.getByTestId('complete-result'), { target: { value: '41:42' } })
        expect(screen.getByTestId('complete-delta')).toHaveTextContent('1:42 slower than goal')
    })

    it('rejects an empty or invalid time and does not submit', async () => {
        const { onSubmit } = setup()
        fireEvent.click(screen.getByTestId('complete-submit'))
        expect(await screen.findByTestId('complete-result-error')).toBeInTheDocument()
        fireEvent.change(screen.getByTestId('complete-result'), { target: { value: '0:61' } })
        fireEvent.click(screen.getByTestId('complete-submit'))
        await waitFor(() => expect(screen.getByTestId('complete-result-error')).toBeInTheDocument())
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it('rejects a time above 24 hours', async () => {
        const { onSubmit } = setup()
        fireEvent.change(screen.getByTestId('complete-result'), { target: { value: '24:00:01' } })
        fireEvent.click(screen.getByTestId('complete-submit'))
        expect(await screen.findByTestId('complete-result-error')).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it('submits seconds and closes', async () => {
        const { onSubmit, onOpenChange } = setup()
        fireEvent.change(screen.getByTestId('complete-result'), { target: { value: '39:30' } })
        fireEvent.click(screen.getByTestId('complete-submit'))
        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('r-run', 2370))
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    })

    it('stays open when saving fails', async () => {
        const { onOpenChange } = setup(vi.fn().mockRejectedValue(new Error('boom')))
        fireEvent.change(screen.getByTestId('complete-result'), { target: { value: '39:30' } })
        fireEvent.click(screen.getByTestId('complete-submit'))
        await waitFor(() => expect(screen.getByTestId('complete-submit')).not.toBeDisabled())
        expect(onOpenChange).not.toHaveBeenCalled()
    })
})
