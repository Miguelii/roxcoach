import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DashboardContent } from '@/modules/dashboard/dashboard-content'

const mocks = vi.hoisted(() => ({
    getTimezoneQuery: vi.fn(),
    getCalendarQuery: vi.fn(),
}))

vi.mock('@/lib/trpc', () => ({
    trpcClient: {
        athlete: {
            getTimezone: { useQuery: mocks.getTimezoneQuery },
        },
        training: {
            getCalendar: { useQuery: mocks.getCalendarQuery },
        },
    },
}))

vi.mock('@/components/activity-actions', () => ({
    ActivityActions: () => <div data-testid="activity-actions" />,
}))

describe('DashboardContent', () => {
    beforeEach(() => {
        mocks.getTimezoneQuery.mockReturnValue({
            data: 'UTC',
            isPending: false,
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
        render(<DashboardContent />)

        expect(screen.getByTestId('dashboard-title')).toHaveTextContent('Progress')
        expect(screen.getByTestId('week-strip')).toBeInTheDocument()
        expect(screen.getByTestId('activity-actions')).toBeInTheDocument()
        expect(screen.queryByTestId('calendar')).toBeNull()
        expect(screen.queryByTestId('next-race')).toBeNull()
    })
})
