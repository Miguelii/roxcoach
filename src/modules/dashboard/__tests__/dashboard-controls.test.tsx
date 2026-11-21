import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DashboardControls } from '@/modules/dashboard/dashboard-controls'

const setup = (range: '3m' | '6m' | '12m' = '6m') => {
    const onRangeChange = vi.fn()
    render(<DashboardControls range={range} onRangeChange={onRangeChange} />)
    return { onRangeChange }
}

describe('DashboardControls', () => {
    it('marks the active range', () => {
        setup('12m')

        expect(screen.getByTestId('range-tab-12m')).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByTestId('range-tab-6m')).toHaveAttribute('aria-selected', 'false')
    })

    it('reports a range change', () => {
        const { onRangeChange } = setup('6m')
        fireEvent.click(screen.getByTestId('range-tab-3m'))

        expect(onRangeChange).toHaveBeenCalledWith('3m')
    })

    it('labels the ranges 3M, 6M and 1Y and has no mode switch', () => {
        setup()

        expect(screen.getByTestId('range-tab-3m')).toHaveTextContent('3M')
        expect(screen.getByTestId('range-tab-6m')).toHaveTextContent('6M')
        expect(screen.getByTestId('range-tab-12m')).toHaveTextContent('1Y')
        expect(screen.queryByTestId('mode-tab-run')).toBeNull()
    })
})
