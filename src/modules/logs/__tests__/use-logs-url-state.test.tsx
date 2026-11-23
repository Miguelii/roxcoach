import { describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { withNuqsTestingAdapter, type UrlUpdateEvent } from 'nuqs/adapters/testing'
import { useLogsUrlState } from '@/modules/logs/use-logs-url-state'

describe('useLogsUrlState', () => {
    it('defaults to the last hour and an empty search', () => {
        const { result } = renderHook(() => useLogsUrlState(), {
            wrapper: withNuqsTestingAdapter(),
        })

        expect(result.current.range).toBe('1h')
        expect(result.current.search).toBe('')
    })

    it('reads the range and search from the URL and falls back on an unknown range', () => {
        const valid = renderHook(() => useLogsUrlState(), {
            wrapper: withNuqsTestingAdapter({ searchParams: '?range=7d&search=zepp' }),
        })
        const invalid = renderHook(() => useLogsUrlState(), {
            wrapper: withNuqsTestingAdapter({ searchParams: '?range=1y' }),
        })

        expect(valid.result.current).toMatchObject({ range: '7d', search: 'zepp' })
        expect(invalid.result.current.range).toBe('1h')
    })

    it('writes the range and search to the URL and drops the defaults', async () => {
        const updates: UrlUpdateEvent[] = []
        const { result } = renderHook(() => useLogsUrlState(), {
            wrapper: withNuqsTestingAdapter({
                hasMemory: true,
                onUrlUpdate: (event) => updates.push(event),
            }),
        })

        act(() => {
            void result.current.setRange('24h')
        })
        await waitFor(() => {
            expect(updates.at(-1)?.searchParams.get('range')).toBe('24h')
        })

        act(() => {
            void result.current.setRange('1h')
            void result.current.setSearch('sync')
        })
        await waitFor(() => {
            expect(updates.at(-1)?.searchParams.get('search')).toBe('sync')
        })
        expect(updates.at(-1)?.searchParams.get('range')).toBeNull()
    })
})
