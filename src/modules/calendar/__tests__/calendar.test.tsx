import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { withNuqsTestingAdapter, type UrlUpdateEvent } from 'nuqs/adapters/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Calendar } from '@/modules/calendar/calendar'

const { getCalendarQuery } = vi.hoisted(() => ({
    getCalendarQuery: vi.fn(),
}))

vi.mock('@/lib/trpc', () => ({
    trpcClient: {
        training: {
            getCalendar: {
                useQuery: getCalendarQuery,
            },
        },
    },
}))

const TODAY = '2026-11-20'

describe('Calendar', () => {
    beforeEach(() => {
        vi.stubGlobal('matchMedia', () => ({
            matches: false,
            addEventListener: () => {},
            removeEventListener: () => {},
        }))
        getCalendarQuery.mockReturnValue({
            data: [],
            isPending: false,
            isError: false,
            refetch: vi.fn(),
        })
    })

    it('updates the URL when navigating and switching calendar views', async () => {
        const updates: UrlUpdateEvent[] = []
        render(<Calendar today={TODAY} />, {
            wrapper: withNuqsTestingAdapter({
                hasMemory: true,
                onUrlUpdate: (event) => updates.push(event),
            }),
        })

        fireEvent.click(screen.getByTestId('calendar-next'))
        await waitFor(() => {
            expect(screen.getByTestId('calendar-title')).toHaveTextContent('December 2026')
        })
        expect(updates.at(-1)?.searchParams.get('date')).toBe('2026-12-01')

        fireEvent.click(screen.getByTestId('calendar-view-week'))
        await waitFor(() => expect(screen.getByTestId('week-view')).toBeInTheDocument())
        expect(updates.at(-1)?.searchParams.get('view')).toBe('week')

        fireEvent.click(screen.getByTestId('calendar-view-month'))
        await waitFor(() => expect(screen.getByTestId('month-view')).toBeInTheDocument())
        expect(updates.at(-1)?.searchParams.get('view')).toBeNull()
    })

    it('keeps the week agenda on mobile even when the URL selects month view', () => {
        vi.stubGlobal('matchMedia', () => ({
            matches: true,
            addEventListener: () => {},
            removeEventListener: () => {},
        }))

        render(<Calendar today={TODAY} />, {
            wrapper: withNuqsTestingAdapter({
                searchParams: '?view=month',
            }),
        })

        expect(screen.getByTestId('week-view')).toBeInTheDocument()
        expect(screen.queryByTestId('month-view')).not.toBeInTheDocument()
    })
})
