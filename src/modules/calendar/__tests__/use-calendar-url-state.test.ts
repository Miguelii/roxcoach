import { act, renderHook } from '@testing-library/react'
import { withNuqsTestingAdapter, type UrlUpdateEvent } from 'nuqs/adapters/testing'
import { describe, expect, it } from 'vitest'
import { useCalendarUrlState } from '@/modules/calendar/use-calendar-url-state'

const TODAY = '2026-11-20'

describe('useCalendarUrlState', () => {
    it('defaults to today and the month view when the URL has no calendar filters', () => {
        const { result } = renderHook(() => useCalendarUrlState(TODAY), {
            wrapper: withNuqsTestingAdapter(),
        })

        expect(result.current.cursor).toBe(TODAY)
        expect(result.current.view).toBe('month')
    })

    it('restores the selected date and view from the URL', () => {
        const { result } = renderHook(() => useCalendarUrlState(TODAY), {
            wrapper: withNuqsTestingAdapter({
                searchParams: '?date=2026-12-03&view=week',
            }),
        })

        expect(result.current.cursor).toBe('2026-12-03')
        expect(result.current.view).toBe('week')
    })

    it('updates and clears calendar filters in the URL', async () => {
        const updates: UrlUpdateEvent[] = []
        const { result } = renderHook(() => useCalendarUrlState(TODAY), {
            wrapper: withNuqsTestingAdapter({
                hasMemory: true,
                onUrlUpdate: (event) => updates.push(event),
            }),
        })

        await act(async () => {
            await result.current.setCursor('2026-12-01')
        })
        await act(async () => {
            await result.current.setView('week')
        })
        await act(async () => {
            await result.current.setCursor(null)
        })

        expect(updates).toHaveLength(3)
        expect(updates[0]?.searchParams.get('date')).toBe('2026-12-01')
        expect(updates[1]?.searchParams.get('view')).toBe('week')
        expect(updates[2]?.searchParams.has('date')).toBe(false)
        expect(updates[2]?.searchParams.get('view')).toBe('week')
        expect(updates[0]?.options.history).toBe('replace')
    })

    it('falls back to today and month for invalid URL values', () => {
        const { result } = renderHook(() => useCalendarUrlState(TODAY), {
            wrapper: withNuqsTestingAdapter({
                searchParams: '?date=2026-02-30&view=day',
            }),
        })

        expect(result.current.cursor).toBe(TODAY)
        expect(result.current.view).toBe('month')
    })
})
