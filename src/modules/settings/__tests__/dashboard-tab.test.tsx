import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DashboardTab } from '@/modules/settings/dashboard-tab'

const mocks = vi.hoisted(() => ({
    getProfileQuery: vi.fn(),
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
            setDashboardMode: { useMutation: () => ({ mutate: mocks.mutate }) },
        },
    },
}))

describe('DashboardTab', () => {
    beforeEach(() => {
        mocks.mutate.mockReset()
        mocks.getProfileQuery.mockReturnValue({ data: { dashboardMode: 'strength' } })
    })

    it('shows the saved mode and saves a change as it is picked', () => {
        render(<DashboardTab />)

        expect(screen.getByTestId('dashboard-settings')).toHaveTextContent('Dashboard')
        expect(screen.getByTestId('dashboard-mode-strength')).toHaveAttribute(
            'aria-selected',
            'true'
        )
        fireEvent.click(screen.getByTestId('dashboard-mode-run'))
        expect(mocks.mutate).toHaveBeenCalledWith({ mode: 'run' })
    })
})
