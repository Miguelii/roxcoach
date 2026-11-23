import { describe, expect, it } from 'vitest'
import { LOG_RANGE_MS, type LogEntry } from '@/_bff/core/constants/logs.constants'
import { buildFacets, buildHistogram, filterLogs, formatLogTime } from '@/modules/logs/logs.utils'

const NOW = Date.parse('2026-11-23T12:00:00.000Z')

const entry = (overrides: Partial<LogEntry> = {}): LogEntry => ({
    id: 'id',
    created_at: new Date(NOW - 1000).toISOString(),
    level: 'info',
    prefix: 'zeppSync',
    message: null,
    metadata: null,
    user_id: null,
    ...overrides,
})

describe('buildFacets', () => {
    it('counts by prefix, most frequent first, ties alphabetical', () => {
        const logs = [
            entry({ prefix: 'zeppSync' }),
            entry({ prefix: 'lyftaSync' }),
            entry({ prefix: 'zeppSync' }),
            entry({ prefix: 'request' }),
        ]

        expect(buildFacets(logs, 'prefix')).toEqual([
            { value: 'zeppSync', count: 2 },
            { value: 'lyftaSync', count: 1 },
            { value: 'request', count: 1 },
        ])
    })

    it('counts by level', () => {
        const logs = [
            entry({ level: 'error' }),
            entry({ level: 'error' }),
            entry({ level: 'info' }),
        ]

        expect(buildFacets(logs, 'level')).toEqual([
            { value: 'error', count: 2 },
            { value: 'info', count: 1 },
        ])
    })
})

const ids = (selected: LogEntry[]) => selected.map((log) => log.id)

describe('filterLogs', () => {
    const logs = [
        entry({ id: 'a', level: 'error', prefix: 'zeppSync' }),
        entry({ id: 'b', level: 'info', prefix: 'zeppSync' }),
        entry({ id: 'c', level: 'error', prefix: 'lyftaSync' }),
    ]

    it('keeps everything when nothing is selected', () => {
        expect(ids(filterLogs(logs, { levels: [], sources: [] }))).toEqual(['a', 'b', 'c'])
    })

    it('filters by level, by source and by both', () => {
        expect(ids(filterLogs(logs, { levels: ['error'], sources: [] }))).toEqual(['a', 'c'])
        expect(ids(filterLogs(logs, { levels: [], sources: ['zeppSync'] }))).toEqual(['a', 'b'])
        expect(ids(filterLogs(logs, { levels: ['error'], sources: ['zeppSync'] }))).toEqual(['a'])
    })
})

describe('buildHistogram', () => {
    it('makes 30 buckets that end at the given time', () => {
        const buckets = buildHistogram([], '1h', NOW)
        const bucketMs = LOG_RANGE_MS['1h'] / 30

        expect(buckets).toHaveLength(30)
        expect(buckets[0].start).toBe(NOW - LOG_RANGE_MS['1h'])
        expect(buckets[29].start).toBe(NOW - bucketMs)
    })

    it('counts a row per level in its bucket and ignores rows outside the window', () => {
        const logs = [
            entry({ level: 'error', created_at: new Date(NOW - 1).toISOString() }),
            entry({ level: 'warn', created_at: new Date(NOW - 1).toISOString() }),
            entry({ level: 'info', created_at: new Date(NOW - LOG_RANGE_MS['1h']).toISOString() }),
            entry({
                level: 'error',
                created_at: new Date(NOW - LOG_RANGE_MS['1h'] - 1).toISOString(),
            }),
        ]

        const buckets = buildHistogram(logs, '1h', NOW)

        expect(buckets[29]).toMatchObject({ error: 1, warn: 1, info: 0, debug: 0 })
        expect(buckets[0]).toMatchObject({ info: 1, error: 0 })
        expect(buckets.reduce((sum, bucket) => sum + bucket.error, 0)).toBe(1)
    })
})

describe('formatLogTime', () => {
    it('shows only the time up to 24 hours and the date and time beyond', () => {
        const iso = '2026-11-23T10:05:07.000Z'

        expect(formatLogTime(iso, '1h')).toMatch(/^\d{1,2}:\d{2}:\d{2}/u)
        expect(formatLogTime(iso, '7d')).toMatch(/^[A-Z][a-z]{2} \d{1,2}, /u)
    })
})
