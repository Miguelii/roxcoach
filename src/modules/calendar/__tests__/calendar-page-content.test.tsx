import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CalendarPageContent } from '@/modules/calendar/calendar-page-content'
import type { TrpcKeyed } from '@/lib/__mocks__/trpc-path'

const mocks = vi.hoisted(() => ({
    getTimezoneQuery: vi.fn(),
}))

vi.mock('@/lib/trpc', () => import('@/lib/__mocks__/trpc'))
vi.mock('@tanstack/react-query', async (importOriginal) => {
    const { routeTrpc } = await import('@/lib/__mocks__/trpc-path')
    return {
        ...(await importOriginal<typeof import('@tanstack/react-query')>()),
        useQuery: (options: TrpcKeyed) =>
            routeTrpc({ 'athlete.getProfile': mocks.getTimezoneQuery }, options),
    }
})

vi.mock('@/modules/calendar/calendar', () => ({
    Calendar: ({ today }: { today: string }) => (
        <div data-testid="calendar-view" data-today={today} />
    ),
}))

vi.mock('@/components/activity-actions', () => ({
    ActivityActions: () => <div data-testid="activity-actions" />,
}))

describe('CalendarPageContent', () => {
    beforeEach(() => {
        mocks.getTimezoneQuery.mockReturnValue({
            data: 'UTC',
            isPending: false,
            refetch: vi.fn(),
        })
    })

    it('shows the calendar and shared activity actions', () => {
        render(<CalendarPageContent />)

        expect(screen.getByTestId('calendar-page-title')).toHaveTextContent('Calendar')
        expect(screen.getByTestId('calendar-view').dataset.today).toMatch(/^\d{4}-\d{2}-\d{2}$/u)
        expect(screen.getByTestId('activity-actions')).toBeInTheDocument()
    })

    it('shows a page-shaped skeleton while loading the athlete timezone', () => {
        mocks.getTimezoneQuery.mockReturnValue({
            data: undefined,
            isPending: true,
            refetch: vi.fn(),
        })

        render(<CalendarPageContent />)

        expect(screen.getByTestId('calendar-page-skeleton')).toBeInTheDocument()
    })

    it('renders from the server timezone while the client query is still pending', () => {
        mocks.getTimezoneQuery.mockReturnValue({
            data: undefined,
            isPending: true,
            refetch: vi.fn(),
        })

        render(<CalendarPageContent initialTimezone="Europe/Lisbon" />)

        expect(screen.queryByTestId('calendar-page-skeleton')).toBeNull()
        expect(screen.getByTestId('calendar-view').dataset.today).toMatch(/^\d{4}-\d{2}-\d{2}$/u)
    })
})
