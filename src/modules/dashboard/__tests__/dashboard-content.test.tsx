import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing'
import { DashboardContent } from '@/modules/dashboard/dashboard-content'
import type { TrpcKeyed } from '@/lib/__mocks__/trpc-path'

const mocks = vi.hoisted(() => ({
    getProfileQuery: vi.fn(),
    getCalendarQuery: vi.fn(),
    getRunProgressQuery: vi.fn(),
    getStrengthProgressQuery: vi.fn(),
    mutate: vi.fn(),
    useMutation: vi.fn(),
}))

vi.mock('@/lib/trpc', () => import('@/lib/__mocks__/trpc'))
vi.mock('@tanstack/react-query', async (importOriginal) => {
    const { routeTrpc } = await import('@/lib/__mocks__/trpc-path')
    return {
        ...(await importOriginal<typeof import('@tanstack/react-query')>()),
        useQuery: (options: TrpcKeyed) =>
            routeTrpc(
                {
                    'athlete.getProfile': mocks.getProfileQuery,
                    'training.getCalendar': mocks.getCalendarQuery,
                    'training.getRunProgress': mocks.getRunProgressQuery,
                    'training.getStrengthProgress': mocks.getStrengthProgressQuery,
                },
                options
            ),
        useMutation: (options: TrpcKeyed) =>
            routeTrpc({ 'athlete.setDashboardMode': mocks.useMutation }, options),
        useQueryClient: () => ({
            cancelQueries: vi.fn(),
            getQueryData: vi.fn(),
            setQueryData: vi.fn(),
            invalidateQueries: vi.fn(),
        }),
    }
})

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

    it('has the range control but no mode switch on the page', () => {
        renderContent()

        expect(screen.getByTestId('range-tab-6m')).toBeInTheDocument()
        expect(screen.queryByTestId('mode-tab-run')).toBeNull()
        expect(screen.queryByTestId('mode-tab-strength')).toBeNull()
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

    it('renders from the server profile while the client query has no data yet', () => {
        mocks.getProfileQuery.mockReturnValue({
            data: undefined,
            isPending: true,
            refetch: vi.fn(),
        })
        mocks.getStrengthProgressQuery.mockReturnValue({
            data: undefined,
            isPending: true,
            refetch: vi.fn(),
        })
        const initialProfile = {
            displayName: 'Athlete',
            timezone: 'UTC',
            maxHr: null,
            restingHr: null,
            hyroxDivision: null,
            weeklyHoursCap: null,
            notes: null,
            dashboardMode: 'strength' as const,
        }
        render(<DashboardContent initialProfile={initialProfile} />, {
            wrapper: withNuqsTestingAdapter(),
        })

        expect(screen.queryByTestId('dashboard-skeleton')).toBeNull()
        expect(screen.getByTestId('dashboard-content')).toBeInTheDocument()
        expect(screen.getByTestId('strength-progress-skeleton')).toBeInTheDocument()
    })
})
