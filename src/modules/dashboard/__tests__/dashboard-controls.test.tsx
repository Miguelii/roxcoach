import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DashboardControls } from '@/modules/dashboard/dashboard-controls'

const setup = (mode: 'run' | 'strength' = 'run', range: '3m' | '6m' | '12m' = '6m') => {
    const onModeChange = vi.fn()
    const onRangeChange = vi.fn()
    render(
        <DashboardControls
            mode={mode}
            onModeChange={onModeChange}
            range={range}
            onRangeChange={onRangeChange}
        />
    )
    return { onModeChange, onRangeChange }
}

describe('DashboardControls', () => {
    it('marks the active mode and range', () => {
        setup('strength', '12m')

        expect(screen.getByTestId('mode-tab-strength')).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByTestId('mode-tab-run')).toHaveAttribute('aria-selected', 'false')
        expect(screen.getByTestId('range-tab-12m')).toHaveAttribute('aria-selected', 'true')
    })

    it('reports a mode change', () => {
        const { onModeChange } = setup('run')
        fireEvent.click(screen.getByTestId('mode-tab-strength'))

        expect(onModeChange).toHaveBeenCalledWith('strength')
    })

    it('reports a range change', () => {
        const { onRangeChange } = setup('run', '6m')
        fireEvent.click(screen.getByTestId('range-tab-3m'))

        expect(onRangeChange).toHaveBeenCalledWith('3m')
    })

    it('labels the ranges 3M, 6M and 1Y', () => {
        setup()

        expect(screen.getByTestId('range-tab-3m')).toHaveTextContent('3M')
        expect(screen.getByTestId('range-tab-6m')).toHaveTextContent('6M')
        expect(screen.getByTestId('range-tab-12m')).toHaveTextContent('1Y')
    })
})
