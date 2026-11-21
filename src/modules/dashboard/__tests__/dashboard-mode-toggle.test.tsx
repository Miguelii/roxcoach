import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DashboardModeSwitch } from '@/modules/dashboard/dashboard-mode-switch'
import { DashboardModeToggle } from '@/modules/dashboard/dashboard-mode-toggle'

const mocks = vi.hoisted(() => ({
    getProfileQuery: vi.fn(),
    useMutation: vi.fn(),
    mutate: vi.fn(),
}))

vi.mock('@/lib/trpc', () => ({
    trpcClient: {
        useUtils: () => ({
            athlete: {
                getProfile: {
                    cancel: vi.fn(),
                    getData: vi.fn(),
                    setData: vi.fn(),
                    invalidate: vi.fn(),
                },
            },
        }),
        athlete: {
            getProfile: { useQuery: mocks.getProfileQuery },
            setDashboardMode: { useMutation: mocks.useMutation },
        },
    },
}))

describe('DashboardModeSwitch', () => {
    it('marks the active mode and reports a change', () => {
        const onChange = vi.fn()
        render(<DashboardModeSwitch mode="strength" onChange={onChange} testIdPrefix="m" />)

        expect(screen.getByTestId('m-strength')).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByTestId('m-run')).toHaveAttribute('aria-selected', 'false')
        fireEvent.click(screen.getByTestId('m-run'))
        expect(onChange).toHaveBeenCalledWith('run')
    })

    it('labels the modes Running and Strength', () => {
        render(<DashboardModeSwitch mode="run" onChange={vi.fn()} testIdPrefix="m" compact />)

        expect(screen.getByTestId('m-run')).toHaveTextContent('Running')
        expect(screen.getByTestId('m-strength')).toHaveTextContent('Strength')
    })
})

describe('DashboardModeToggle', () => {
    beforeEach(() => {
        mocks.mutate.mockReset()
        mocks.useMutation.mockReturnValue({ mutate: mocks.mutate })
    })

    it('shows the saved mode and saves a change', () => {
        mocks.getProfileQuery.mockReturnValue({ data: { dashboardMode: 'run' } })
        render(<DashboardModeToggle testIdPrefix="t" />)

        expect(screen.getByTestId('t-run')).toHaveAttribute('aria-selected', 'true')
        fireEvent.click(screen.getByTestId('t-strength'))
        expect(mocks.mutate).toHaveBeenCalledWith({ mode: 'strength' })
    })

    it('shows a placeholder while the profile loads', () => {
        mocks.getProfileQuery.mockReturnValue({ data: undefined })
        render(<DashboardModeToggle testIdPrefix="t" />)

        expect(screen.getByTestId('t-loading')).toBeInTheDocument()
        expect(screen.queryByTestId('t-run')).toBeNull()
    })
})
