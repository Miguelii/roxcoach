import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { LogEntry } from '@/_bff/core/constants/logs.constants'
import { useLogsExplorer } from '@/modules/logs/use-logs-explorer'

const FETCHED_AT = '2026-11-23T12:00:00.000Z'

const entry = (id: string, level: LogEntry['level'], prefix: string): LogEntry => ({
    id,
    created_at: '2026-11-23T11:59:00.000Z',
    level,
    prefix,
    message: id,
    metadata: null,
    user_id: null,
})

const LOGS = [
    entry('a', 'error', 'zeppSync'),
    entry('b', 'info', 'zeppSync'),
    entry('c', 'error', 'lyftaSync'),
]

const render = () =>
    renderHook(() => useLogsExplorer({ logs: LOGS, range: '1h', fetchedAt: FETCHED_AT }))

describe('useLogsExplorer', () => {
    it('shows every log and no active filter at first', () => {
        const { result } = render()

        expect(result.current.filteredLogs).toHaveLength(3)
        expect(result.current.hasFilters).toBe(false)
    })

    it('filters by a toggled level and toggles it back off', () => {
        const { result } = render()

        act(() => result.current.toggleLevel('error'))
        expect(result.current.filteredLogs.map((log) => log.id)).toEqual(['a', 'c'])
        expect(result.current.hasFilters).toBe(true)

        act(() => result.current.toggleLevel('error'))
        expect(result.current.filteredLogs).toHaveLength(3)
    })

    it('counts source facets inside the active level filter', () => {
        const { result } = render()

        act(() => result.current.toggleLevel('info'))

        expect(result.current.sourceFacets).toEqual([{ value: 'zeppSync', count: 1 }])
    })

    it('clears every filter', () => {
        const { result } = render()
        act(() => {
            result.current.toggleLevel('error')
            result.current.toggleSource('zeppSync')
        })

        act(() => result.current.clearFilters())

        expect(result.current.filteredLogs).toHaveLength(3)
        expect(result.current.hasFilters).toBe(false)
    })

    it('selects a log and closes its details', () => {
        const { result } = render()

        act(() => result.current.selectLog('b'))
        expect(result.current.selectedLog?.id).toBe('b')

        act(() => result.current.closeDetails())
        expect(result.current.selectedLog).toBeNull()
    })
})
