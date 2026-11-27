import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RunTypeControl } from '@/modules/activity/run-type-control'

const renderControl = (props: Partial<Parameters<typeof RunTypeControl>[0]> = {}) => {
    const onChange = vi.fn()
    render(
        <RunTypeControl
            activityId="act-1"
            runType="long"
            manual={false}
            onChange={onChange}
            pending={false}
            {...props}
        />
    )
    return onChange
}

describe('RunTypeControl', () => {
    it('shows the current type (Long run, Fast run, None)', () => {
        renderControl({ runType: 'long' })
        expect(screen.getByTestId('run-type-select')).toHaveTextContent('Long run')
        cleanup()
        renderControl({ runType: 'fast' })
        expect(screen.getByTestId('run-type-select')).toHaveTextContent('Fast run')
    })

    it('shows None when the run has no type', () => {
        renderControl({ runType: null })
        expect(screen.getByTestId('run-type-select')).toHaveTextContent('None')
    })

    it('says Set automatically from your rules when not manual', () => {
        renderControl()
        expect(screen.getByTestId('run-type-hint')).toHaveTextContent(
            'Set automatically from your rules'
        )
        expect(screen.queryByTestId('run-type-reset')).toBeNull()
    })

    it('says Set by you and offers Use my rules when manual', () => {
        const onChange = renderControl({ manual: true })
        expect(screen.getByTestId('run-type-hint')).toHaveTextContent('Set by you')
        expect(screen.getByTestId('run-type-reset')).toHaveTextContent('Use my rules')
        fireEvent.click(screen.getByTestId('run-type-reset'))
        expect(onChange).toHaveBeenCalledWith('auto')
    })

    it('calls onChange with none when None is picked', async () => {
        const onChange = renderControl()
        fireEvent.click(screen.getByTestId('run-type-select'))
        const option = await screen.findByTestId('run-type-option-none')
        fireEvent.pointerDown(option, { pointerType: 'mouse' })
        fireEvent.mouseUp(option)
        fireEvent.click(option)
        await waitFor(() => expect(onChange).toHaveBeenCalledWith('none'))
    })

    it('disables the controls while pending', () => {
        renderControl({ manual: true, pending: true })
        expect(screen.getByTestId('run-type-select')).toBeDisabled()
        expect(screen.getByTestId('run-type-reset')).toBeDisabled()
    })
})
