/* oxlint-disable unicorn/consistent-function-scoping -- test helpers stay next to the cases that use them */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SyncIntegrations } from '@/components/sync-integrations'
import type { SyncSource } from '@/lib/sync-source'

const mocks = vi.hoisted(() => ({ isMobile: false }))

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mocks.isMobile }))

const source = (overrides: Partial<SyncSource> & Pick<SyncSource, 'id' | 'name'>): SyncSource => ({
    status: 'connected',
    lastSyncedAt: null,
    isSyncing: false,
    sync: vi.fn(async () => {}),
    ...overrides,
})

const open = async () => {
    fireEvent.click(screen.getByTestId('sync-integrations-button'))
    return screen.findByTestId('sync-integrations-list')
}

describe('SyncIntegrations', () => {
    beforeEach(() => {
        mocks.isMobile = false
    })

    it('opens the list when the button is clicked and syncs nothing by itself', async () => {
        const lyfta = vi.fn(async () => {})
        const zepp = vi.fn(async () => {})
        render(
            <SyncIntegrations
                sources={[
                    source({ id: 'lyfta', name: 'Lyfta', sync: lyfta }),
                    source({ id: 'zepp', name: 'Zepp', sync: zepp }),
                ]}
            />
        )
        expect(screen.queryByTestId('sync-integrations-list')).toBeNull()

        await open()

        expect(lyfta).not.toHaveBeenCalled()
        expect(zepp).not.toHaveBeenCalled()
        expect(screen.getByTestId('sync-source-lyfta')).toBeInTheDocument()
        expect(screen.getByTestId('sync-source-zepp')).toBeInTheDocument()
    })

    it('shows the list as a popover on a wide screen and as a bottom drawer on a phone', async () => {
        const { unmount } = render(
            <SyncIntegrations sources={[source({ id: 'lyfta', name: 'Lyfta' })]} />
        )
        expect(await open()).toHaveAttribute('data-presentation', 'popover')
        unmount()

        mocks.isMobile = true
        render(<SyncIntegrations sources={[source({ id: 'lyfta', name: 'Lyfta' })]} />)
        expect(await open()).toHaveAttribute('data-presentation', 'drawer')
    })

    it('lists every integration with its state', async () => {
        render(
            <SyncIntegrations
                sources={[
                    source({
                        id: 'lyfta',
                        name: 'Lyfta',
                        lastSyncedAt: '2026-11-21T10:00:00.000Z',
                    }),
                    source({ id: 'zepp', name: 'Zepp' }),
                    source({ id: 'strava', name: 'Strava', status: 'disconnected' }),
                    source({ id: 'garmin', name: 'Garmin', status: 'loading' }),
                    source({ id: 'whoop', name: 'Whoop', status: 'error' }),
                ]}
            />
        )
        await open()

        expect(screen.getByTestId('sync-source-lyfta')).toHaveTextContent(
            'Last synced Nov 21, 2026'
        )
        expect(screen.getByTestId('sync-source-zepp')).toHaveTextContent('Not synced yet')
        expect(screen.queryByTestId('sync-source-strava')).toBeNull()
        expect(screen.getByTestId('sync-source-garmin')).toHaveTextContent('Loading')
        expect(screen.getByTestId('sync-source-whoop')).toHaveTextContent('Whoop')
        expect(screen.getByTestId('sync-source-whoop')).not.toHaveTextContent('Could not load')
        expect(screen.getByTestId('sync-source-whoop')).toBeDisabled()
    })

    it('syncs only the chosen integration and closes the list', async () => {
        const lyfta = vi.fn(async () => {})
        const zepp = vi.fn(async () => {})
        render(
            <SyncIntegrations
                sources={[
                    source({ id: 'lyfta', name: 'Lyfta', sync: lyfta }),
                    source({ id: 'zepp', name: 'Zepp', sync: zepp }),
                ]}
            />
        )
        await open()

        fireEvent.click(screen.getByTestId('sync-source-zepp'))

        expect(zepp).toHaveBeenCalledTimes(1)
        expect(lyfta).not.toHaveBeenCalled()
        await waitFor(() => expect(screen.queryByTestId('sync-integrations-list')).toBeNull())
    })

    it('leaves out an integration the athlete has not connected', async () => {
        render(
            <SyncIntegrations
                sources={[
                    source({ id: 'lyfta', name: 'Lyfta' }),
                    source({ id: 'zepp', name: 'Zepp', status: 'disconnected' }),
                ]}
            />
        )
        await open()

        expect(screen.getByTestId('sync-source-lyfta')).toBeInTheDocument()
        expect(screen.queryByTestId('sync-source-zepp')).toBeNull()
        expect(screen.queryByTestId('sync-integrations-empty')).toBeNull()
    })

    it('points to Settings when no integration is connected', async () => {
        render(
            <SyncIntegrations
                sources={[
                    source({ id: 'lyfta', name: 'Lyfta', status: 'disconnected' }),
                    source({ id: 'zepp', name: 'Zepp', status: 'disconnected' }),
                ]}
            />
        )
        await open()

        expect(screen.getByTestId('sync-integrations-empty')).toHaveTextContent(
            'No integration connected'
        )
        expect(screen.getByTestId('sync-integrations-settings')).toHaveAttribute(
            'href',
            '/settings'
        )
        expect(screen.queryByTestId('sync-source-lyfta')).toBeNull()
    })

    it('marks the button busy while something syncs and disables only that row', async () => {
        render(
            <SyncIntegrations
                sources={[
                    source({ id: 'lyfta', name: 'Lyfta', isSyncing: true }),
                    source({ id: 'zepp', name: 'Zepp' }),
                ]}
            />
        )
        expect(screen.getByTestId('sync-integrations-button')).toHaveAttribute('aria-busy', 'true')
        await open()

        expect(screen.getByTestId('sync-source-lyfta')).toBeDisabled()
        expect(screen.getByTestId('sync-source-zepp')).toBeEnabled()
    })

    it('is not busy when nothing syncs', () => {
        render(<SyncIntegrations sources={[source({ id: 'lyfta', name: 'Lyfta' })]} />)

        expect(screen.getByTestId('sync-integrations-button')).toHaveAttribute('aria-busy', 'false')
    })
})
