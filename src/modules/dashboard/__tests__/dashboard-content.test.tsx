import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing'
import { DashboardContent } from '@/modules/dashboard/dashboard-content'

const mocks = vi.hoisted(() => ({
    getProfileQuery: vi.fn(),
    getCalendarQuery: vi.fn(),
    getRunProgressQuery: vi.fn(),
    getStrengthProgressQuery: vi.fn(),
    mutate: vi.fn(),
    useMutation: vi.fn(),
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
        training: {
            getCalendar: { useQuery: mocks.getCalendarQuery },
            getRunProgress: { useQuery: mocks.getRunProgressQuery },
            getStrengthProgress: { useQuery: mocks.getStrengthProgressQuery },
        },
    },
}))

vi.mock('@/components/activity-actions', () => ({
    ActivityActions: () => <div data-testid="activity-actions" />,
}))

const profile = (dashboardMode: 'run' | 'strength') => ({
    data: { timezone: 'UTC', dashboardMode },
    isPending: false,
    refetch: vi.fn(),
})

const renderContent = () => render(<DashboardContent />, { wrapper: withNuqsTestingAdapter() })

describe('DashboardContent', () => {
    beforeEach(() => {
        mocks.getProfileQuery.mockReturnValue(profile('run'))
        mocks.useMutation.mockReturnValue({ mutate: mocks.mutate })
        mocks.mutate.mockReset()
        mocks.getStrengthProgressQuery.mockReturnValue({
            data: undefined,
            isPending: true,
            refetch: vi.fn(),
        })
        mocks.getRunProgressQuery.mockReturnValue({
            data: undefined,
            isPending: true,
            refetch: vi.fn(),
        })
        mocks.getCalendarQuery.mockReturnValue({
            data: [],
            isPending: false,
            isError: false,
            refetch: vi.fn(),
        })
    })

    it('keeps the progress summary and shared actions without calendar content', () => {
        renderContent()

        expect(screen.getByTestId('dashboard-title')).toHaveTextContent('Progress')
        expect(screen.getByTestId('week-strip')).toBeInTheDocument()
        expect(screen.getByTestId('activity-actions')).toBeInTheDocument()
        expect(screen.queryByTestId('calendar')).toBeNull()
        expect(screen.queryByTestId('next-race')).toBeNull()
    })

    it('shows the mode saved in the profile and saves a change', () => {
        mocks.getProfileQuery.mockReturnValue(profile('strength'))
        renderContent()

        expect(screen.getByTestId('mode-tab-strength')).toHaveAttribute('aria-selected', 'true')
        fireEvent.click(screen.getByTestId('mode-tab-run'))
        expect(mocks.mutate).toHaveBeenCalledWith({ mode: 'run' })
    })

    it('shows the running progress in run mode and the strength progress in strength mode', () => {
        const { unmount } = renderContent()
        expect(screen.getByTestId('run-progress-skeleton')).toBeInTheDocument()
        unmount()

        mocks.getProfileQuery.mockReturnValue(profile('strength'))
        renderContent()
        expect(screen.queryByTestId('run-progress-skeleton')).toBeNull()
        expect(screen.getByTestId('strength-progress-skeleton')).toBeInTheDocument()
    })

    it('shows the skeleton while the profile loads and an error with retry when it fails', () => {
        mocks.getProfileQuery.mockReturnValue({
            data: undefined,
            isPending: true,
            refetch: vi.fn(),
        })
        const { unmount } = renderContent()
        expect(screen.getByTestId('dashboard-skeleton')).toBeInTheDocument()
        unmount()

        const refetch = vi.fn()
        mocks.getProfileQuery.mockReturnValue({ data: undefined, isPending: false, refetch })
        renderContent()
        fireEvent.click(screen.getByText('Try again'))
        expect(screen.getByTestId('dashboard-profile-error')).toBeInTheDocument()
        expect(refetch).toHaveBeenCalled()
    })
})
