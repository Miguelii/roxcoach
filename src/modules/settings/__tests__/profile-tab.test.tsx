import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ProfileTab } from '@/modules/settings/profile-tab'

const mocks = vi.hoisted(() => ({
    getProfileQuery: vi.fn(),
    mutate: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
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
                getTimezone: { invalidate: vi.fn() },
            },
            training: { getRunProgress: { invalidate: vi.fn() } },
        }),
        athlete: {
            getProfile: { useQuery: mocks.getProfileQuery },
            updateProfile: { useMutation: () => ({ mutateAsync: vi.fn() }) },
            setDashboardMode: { useMutation: () => ({ mutate: mocks.mutate }) },
        },
    },
}))

const PROFILE = {
    displayName: 'Ana',
    timezone: 'Europe/Lisbon',
    maxHr: 190,
    restingHr: 50,
    hyroxDivision: null,
    weeklyHoursCap: null,
    notes: null,
    dashboardMode: 'strength',
}

describe('ProfileTab dashboard mode', () => {
    beforeEach(() => {
        mocks.mutate.mockReset()
        mocks.getProfileQuery.mockReturnValue({
            data: PROFILE,
            isPending: false,
            isError: false,
            refetch: vi.fn(),
        })
    })

    it('shows the saved mode and saves a change as it is picked, apart from the form', () => {
        render(<ProfileTab />)

        expect(screen.getByTestId('profile-dashboard-mode')).toHaveTextContent('Dashboard')
        expect(screen.getByTestId('profile-mode-strength')).toHaveAttribute('aria-selected', 'true')
        fireEvent.click(screen.getByTestId('profile-mode-run'))
        expect(mocks.mutate).toHaveBeenCalledWith({ mode: 'run' })
    })
})
