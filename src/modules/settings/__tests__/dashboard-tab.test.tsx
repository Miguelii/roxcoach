import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DashboardTab } from '@/modules/settings/dashboard-tab'
import type { TrpcKeyed } from '@/lib/__mocks__/trpc-path'

const mocks = vi.hoisted(() => ({
    getProfileQuery: vi.fn(),
    mutate: vi.fn(),
}))

vi.mock('@/lib/trpc', () => import('@/lib/__mocks__/trpc'))
vi.mock('@tanstack/react-query', async (importOriginal) => {
    const { routeTrpc } = await import('@/lib/__mocks__/trpc-path')
    return {
        ...(await importOriginal<typeof import('@tanstack/react-query')>()),
        useQuery: (options: TrpcKeyed) =>
            routeTrpc({ 'athlete.getProfile': mocks.getProfileQuery }, options),
        useMutation: (options: TrpcKeyed) =>
            routeTrpc({ 'athlete.setDashboardMode': () => ({ mutate: mocks.mutate }) }, options),
        useQueryClient: () => ({
            cancelQueries: vi.fn(),
            getQueryData: vi.fn(),
            setQueryData: vi.fn(),
            invalidateQueries: vi.fn(),
        }),
    }
})

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
