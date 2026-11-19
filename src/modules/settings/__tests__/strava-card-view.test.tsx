import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StravaCardView } from '@/modules/settings/strava-card-view'
import { isStravaUrl, parseStravaResult } from '@/modules/settings/strava-result'

type Overrides = Partial<Parameters<typeof StravaCardView>[0]>

const connectedStatus = {
    connected: true,
    connectedAt: '2026-11-01T10:00:00.000Z',
    lastSyncedAt: '2026-11-19T14:05:00.000Z',
    activityCount: 42,
}

const setup = (overrides: Overrides = {}) => {
    const props = {
        status: { connected: false, connectedAt: null, lastSyncedAt: null, activityCount: 0 },
        onConnect: vi.fn().mockResolvedValue({}),
        onSync: vi.fn().mockResolvedValue({}),
        onDisconnect: vi.fn().mockResolvedValue({}),
        onError: vi.fn(),
        onRetry: vi.fn(),
        ...overrides,
    }
    render(<StravaCardView {...props} />)
    return props
}

describe('StravaCardView', () => {
    it('shows only Connect Strava when disconnected', () => {
        setup()

        expect(screen.getByTestId('strava-status')).toHaveTextContent('Not connected')
        expect(screen.getByTestId('strava-connect')).toHaveTextContent('Connect Strava')
        expect(screen.queryByTestId('strava-disconnect')).not.toBeInTheDocument()
        expect(screen.queryByTestId('strava-sync-now')).not.toBeInTheDocument()
        expect(screen.queryByTestId('strava-last-sync')).not.toBeInTheDocument()
    })

    it('calls onConnect when Connect Strava is clicked', async () => {
        const props = setup()
        fireEvent.click(screen.getByTestId('strava-connect'))
        await waitFor(() => expect(props.onConnect).toHaveBeenCalledTimes(1))
    })

    it('shows last sync, count, Sync now and Disconnect when connected', () => {
        setup({ status: connectedStatus })

        expect(screen.getByTestId('strava-status')).toHaveTextContent('Connected')
        expect(screen.getByTestId('strava-last-sync')).toHaveTextContent('2026')
        expect(screen.getByTestId('strava-activity-count')).toHaveTextContent('42')
        expect(screen.getByTestId('strava-sync-now')).toHaveTextContent('Sync now')
        expect(screen.getByTestId('strava-disconnect')).toHaveTextContent('Disconnect')
        expect(screen.queryByTestId('strava-connect')).not.toBeInTheDocument()
    })

    it('says Not synced yet for a connection that never synced', () => {
        setup({ status: { ...connectedStatus, lastSyncedAt: null, activityCount: 0 } })
        expect(screen.getByTestId('strava-last-sync')).toHaveTextContent('Not synced yet')
        expect(screen.getByTestId('strava-card').textContent).not.toMatch(/n\/a/iu)
    })

    it('runs Sync now through onSync', async () => {
        const props = setup({ status: connectedStatus })
        fireEvent.click(screen.getByTestId('strava-sync-now'))
        await waitFor(() => expect(props.onSync).toHaveBeenCalledTimes(1))
    })

    it('shows Sync started after a successful sync and not after a failed one', async () => {
        const onSync = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('x'))
        const props = setup({ status: connectedStatus, onSync })
        expect(screen.queryByTestId('strava-sync-started')).not.toBeInTheDocument()
        fireEvent.click(screen.getByTestId('strava-sync-now'))
        await waitFor(() =>
            expect(screen.getByTestId('strava-sync-started')).toHaveTextContent('Sync started')
        )
        fireEvent.click(screen.getByTestId('strava-sync-now'))
        await waitFor(() => expect(props.onError).toHaveBeenCalledTimes(1))
        expect(screen.queryByTestId('strava-sync-started')).not.toBeInTheDocument()
    })

    it('clears Sync started when the status refetches', async () => {
        const props = {
            onConnect: vi.fn(),
            onSync: vi.fn().mockResolvedValue({}),
            onDisconnect: vi.fn(),
            onError: vi.fn(),
            onRetry: vi.fn(),
        }
        const { rerender } = render(<StravaCardView {...props} status={connectedStatus} />)
        fireEvent.click(screen.getByTestId('strava-sync-now'))
        await waitFor(() => expect(screen.getByTestId('strava-sync-started')).toBeInTheDocument())
        rerender(<StravaCardView {...props} status={{ ...connectedStatus, activityCount: 50 }} />)
        expect(screen.queryByTestId('strava-sync-started')).not.toBeInTheDocument()
    })

    it('asks for confirmation before disconnecting', async () => {
        const props = setup({ status: connectedStatus })

        fireEvent.click(screen.getByTestId('strava-disconnect'))
        expect(props.onDisconnect).not.toHaveBeenCalled()
        expect(screen.getByTestId('strava-disconnect-confirm')).toBeInTheDocument()

        fireEvent.click(screen.getByTestId('strava-disconnect-cancel'))
        expect(props.onDisconnect).not.toHaveBeenCalled()
        expect(screen.getByTestId('strava-disconnect')).toBeInTheDocument()

        fireEvent.click(screen.getByTestId('strava-disconnect'))
        fireEvent.click(screen.getByTestId('strava-disconnect-confirm'))
        await waitFor(() => expect(props.onDisconnect).toHaveBeenCalledTimes(1))
    })

    it.each([
        ['connected', 'Strava connected'],
        ['denied', 'You did not allow access'],
        ['scope', 'Roxcoach needs permission to read all your activities'],
        ['error', 'Something went wrong, try again'],
    ] as const)('shows the %s result message', (result, message) => {
        setup({ result })
        expect(screen.getByTestId('strava-result')).toHaveTextContent(message)
    })

    it('shows no result message without a result', () => {
        setup()
        expect(screen.queryByTestId('strava-result')).not.toBeInTheDocument()
    })

    it('shows the attribution', () => {
        setup()
        expect(screen.getByTestId('strava-attribution')).toHaveTextContent('Compatible with Strava')
    })

    it('reports a failed mutation and keeps the buttons usable', async () => {
        const props = setup({
            status: connectedStatus,
            onSync: vi.fn().mockRejectedValue(new Error('boom-secret-detail')),
        })

        fireEvent.click(screen.getByTestId('strava-sync-now'))

        await waitFor(() => expect(props.onError).toHaveBeenCalledTimes(1))
        expect(props.onError).toHaveBeenCalledWith('Could not sync with Strava, try again')
        await waitFor(() => expect(screen.getByTestId('strava-sync-now')).toBeEnabled())
        expect(screen.getByTestId('strava-disconnect')).toBeEnabled()
    })

    it('reports a failed connect and keeps Connect usable', async () => {
        const props = setup({ onConnect: vi.fn().mockRejectedValue(new Error('x')) })
        fireEvent.click(screen.getByTestId('strava-connect'))
        await waitFor(() => expect(props.onError).toHaveBeenCalledTimes(1))
        await waitFor(() => expect(screen.getByTestId('strava-connect')).toBeEnabled())
    })

    it('shows a load error with a retry action', () => {
        const props = setup({ status: null, loadFailed: true })
        expect(screen.getByTestId('strava-load-error')).toBeInTheDocument()
        fireEvent.click(screen.getByTestId('strava-retry'))
        expect(props.onRetry).toHaveBeenCalledTimes(1)
    })

    it('shows a skeleton while the status loads', () => {
        setup({ status: null })
        expect(screen.getByTestId('strava-loading')).toBeInTheDocument()
        expect(screen.queryByTestId('strava-connect')).not.toBeInTheDocument()
    })

    it('never renders anything token-like', () => {
        setup({ status: connectedStatus, result: 'connected' })
        expect(screen.getByTestId('strava-card').textContent).not.toMatch(
            /token|secret|refresh_|access_|bearer/iu
        )
    })
})

describe('parseStravaResult', () => {
    it('accepts the four callback values', () => {
        for (const value of ['connected', 'denied', 'scope', 'error'] as const) {
            expect(parseStravaResult(value)).toBe(value)
        }
    })

    it('ignores anything else', () => {
        expect(parseStravaResult('<script>')).toBeUndefined()
        expect(parseStravaResult(['connected'])).toBeUndefined()
        expect(parseStravaResult('')).toBeUndefined()
    })
})

describe('isStravaUrl', () => {
    it('accepts the Strava authorize url', () => {
        expect(isStravaUrl('https://www.strava.com/oauth/authorize?client_id=1&state=abc')).toBe(
            true
        )
    })

    it('rejects another origin, a relative url and garbage', () => {
        expect(isStravaUrl('https://evil.example/oauth/authorize')).toBe(false)
        expect(isStravaUrl('https://www.strava.com.evil.example/x')).toBe(false)
        expect(isStravaUrl('http://www.strava.com/oauth/authorize')).toBe(false)
        expect(isStravaUrl('/oauth/authorize')).toBe(false)
        expect(isStravaUrl('not a url')).toBe(false)
    })
})
