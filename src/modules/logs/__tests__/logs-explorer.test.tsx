import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { withNuqsTestingAdapter, type UrlUpdateEvent } from 'nuqs/adapters/testing'
import type { LogEntry } from '@/_bff/core/constants/logs.constants'
import { LogsExplorer } from '@/modules/logs/logs-explorer'

const FETCHED_AT = '2026-11-23T12:00:00.000Z'

const entry = (overrides: Partial<LogEntry> & { id: string }): LogEntry => ({
    created_at: '2026-11-23T11:55:00.000Z',
    level: 'info',
    prefix: 'zeppSync',
    message: 'Sync succeeded',
    metadata: null,
    user_id: null,
    ...overrides,
})

const LOGS: LogEntry[] = [
    entry({
        id: 'a',
        level: 'error',
        message: 'Your Zepp session expired',
        metadata: { errorCode: 'zepp009' },
    }),
    entry({ id: 'b', level: 'info', message: 'Sync started', prefix: 'lyftaSync' }),
    entry({ id: 'c', level: 'info', message: 'Sync succeeded' }),
]

type Setup = { logs?: LogEntry[]; isTruncated?: boolean; updates?: UrlUpdateEvent[] }

const renderExplorer = ({ logs = LOGS, isTruncated = false, updates }: Setup = {}) =>
    render(
        <LogsExplorer logs={logs} isTruncated={isTruncated} range="1h" fetchedAt={FETCHED_AT} />,
        {
            wrapper: withNuqsTestingAdapter({
                hasMemory: true,
                onUrlUpdate: (event) => updates?.push(event),
            }),
        }
    )

describe('LogsExplorer', () => {
    beforeEach(() => {
        vi.stubGlobal('matchMedia', () => ({
            matches: false,
            addEventListener: () => {},
            removeEventListener: () => {},
        }))
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('lists the logs with their message and source', () => {
        renderExplorer()

        expect(screen.getByTestId('logs-row-a')).toHaveTextContent('Your Zepp session expired')
        expect(screen.getByTestId('logs-row-b')).toHaveTextContent('lyftaSync')
        expect(screen.getByTestId('logs-row-c')).toHaveTextContent('Sync succeeded')
    })

    it('filters by level and restores the list when the filters are cleared', () => {
        renderExplorer()

        fireEvent.click(screen.getByTestId('logs-filter-level-error'))
        expect(screen.getByTestId('logs-row-a')).toBeInTheDocument()
        expect(screen.queryByTestId('logs-row-b')).toBeNull()

        fireEvent.click(screen.getByTestId('logs-clear-filters'))
        expect(screen.getByTestId('logs-row-b')).toBeInTheDocument()
    })

    it('filters by source', () => {
        renderExplorer()

        fireEvent.click(screen.getByTestId('logs-filter-source-lyftaSync'))

        expect(screen.getByTestId('logs-row-b')).toBeInTheDocument()
        expect(screen.queryByTestId('logs-row-c')).toBeNull()
    })

    it('opens the details of a log with its message and metadata', async () => {
        renderExplorer()

        fireEvent.click(screen.getByTestId('logs-row-a'))

        await waitFor(() => {
            expect(screen.getByTestId('logs-details')).toBeInTheDocument()
        })
        expect(screen.getByTestId('log-details-message')).toHaveTextContent(
            'Your Zepp session expired'
        )
        expect(screen.getByTestId('log-details-metadata')).toHaveTextContent(
            '"errorCode": "zepp009"'
        )
    })

    it('copies the metadata as formatted JSON from the copy button', async () => {
        const writeText = vi.fn(async () => {})
        vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
        renderExplorer()
        fireEvent.click(screen.getByTestId('logs-row-a'))
        await waitFor(() => {
            expect(screen.getByTestId('log-details-copy')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByTestId('log-details-copy'))

        await waitFor(() => {
            expect(writeText).toHaveBeenCalledWith(
                JSON.stringify({ errorCode: 'zepp009' }, null, 2)
            )
        })
        await waitFor(() => {
            expect(screen.getByTestId('log-details-copy')).toHaveAttribute('data-copied', 'true')
        })
    })

    it('has no copy button for a log without metadata', async () => {
        renderExplorer()

        fireEvent.click(screen.getByTestId('logs-row-b'))

        await waitFor(() => {
            expect(screen.getByTestId('logs-details')).toBeInTheDocument()
        })
        expect(screen.queryByTestId('log-details-copy')).toBeNull()
    })

    it('says the range was truncated when the fetch limit was reached', () => {
        renderExplorer({ isTruncated: true })

        expect(screen.getByTestId('logs-truncated')).toBeInTheDocument()
    })

    it('shows the empty state, without a clear button, when the range has no logs', () => {
        renderExplorer({ logs: [] })

        expect(screen.getByTestId('logs-empty')).toHaveTextContent('No logs in this time range')
        expect(screen.queryByTestId('logs-clear-filters')).toBeNull()
    })

    it('shows a no-match state with a way out when the filters match nothing', () => {
        renderExplorer({ logs: [LOGS[1]] })

        fireEvent.click(screen.getByTestId('logs-filter-level-error'))

        expect(screen.getByTestId('logs-empty')).toHaveTextContent('No logs match these filters')
        fireEvent.click(screen.getByTestId('logs-clear-filters'))
        expect(screen.getByTestId('logs-row-b')).toBeInTheDocument()
    })

    it('writes the chosen range and the search to the URL', async () => {
        const updates: UrlUpdateEvent[] = []
        renderExplorer({ updates })

        fireEvent.click(screen.getByTestId('logs-range-24h'))
        await waitFor(() => {
            expect(updates.at(-1)?.searchParams.get('range')).toBe('24h')
        })

        fireEvent.change(screen.getByTestId('logs-search'), { target: { value: 'zepp' } })
        await waitFor(() => {
            expect(updates.at(-1)?.searchParams.get('search')).toBe('zepp')
        })
    })

    it('sends a search with a trailing space once, without refetching in a loop', async () => {
        const updates: UrlUpdateEvent[] = []
        renderExplorer({ updates })

        fireEvent.change(screen.getByTestId('logs-search'), { target: { value: 'zepp ' } })
        await waitFor(() => {
            expect(updates.at(-1)?.searchParams.get('search')).toBe('zepp')
        })
        const settled = updates.length
        await new Promise((resolve) => {
            setTimeout(resolve, 900)
        })

        expect(updates).toHaveLength(settled)
    })

    it('limits the search to the 200 characters the server accepts', () => {
        renderExplorer()

        expect(screen.getByTestId('logs-search')).toHaveAttribute('maxlength', '200')
    })

    it('draws the histogram', () => {
        renderExplorer()

        expect(screen.getByTestId('logs-histogram')).toBeInTheDocument()
    })
})
