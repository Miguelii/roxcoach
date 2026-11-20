import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ActivityActions } from '@/components/activity-actions'

type ConnectionQuery = {
    data: { connected: boolean; lastSyncedAt: string | null }
    isPending: boolean
    isError: boolean
    refetch: () => void
}

type SyncResult = { created: number; updated: number; lastSyncedAt: string }

type LyftaState = {
    errorMessage: string | null
    formatTimestamp: (value: string) => string
    isSyncing: boolean
    syncResult: SyncResult | null
    syncWorkouts: () => void
}

const mocks = vi.hoisted(() => {
    const connectionQuery: ConnectionQuery = {
        data: { connected: true, lastSyncedAt: null },
        isPending: false,
        isError: false,
        refetch: vi.fn(),
    }
    const lyfta: LyftaState = {
        errorMessage: null,
        formatTimestamp: () => 'Nov 20, 2026, 8:30 AM',
        isSyncing: false,
        syncResult: null,
        syncWorkouts: vi.fn(),
    }
    return { connectionQuery, lyfta }
})

vi.mock('@/lib/trpc', () => ({
    trpcClient: {
        lyfta: {
            getConnectionStatus: { useQuery: () => mocks.connectionQuery },
        },
    },
}))

vi.mock('@/modules/lyfta/use-lyfta-sync', () => ({
    useLyftaSync: () => mocks.lyfta,
}))

vi.mock('@/modules/dashboard/upload-activity', () => ({
    UploadActivity: () => <button type="button" data-testid="upload-activity-button" />,
}))

describe('ActivityActions', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.connectionQuery.data = { connected: true, lastSyncedAt: null }
        mocks.connectionQuery.isPending = false
        mocks.connectionQuery.isError = false
        mocks.lyfta.errorMessage = null
        mocks.lyfta.isSyncing = false
        mocks.lyfta.syncResult = null
    })

    it('shows upload and sync buttons and starts a manual sync', () => {
        render(<ActivityActions />)

        expect(screen.getByTestId('upload-activity-button')).toBeInTheDocument()
        fireEvent.click(screen.getByTestId('activity-sync-lyfta'))
        expect(mocks.lyfta.syncWorkouts).toHaveBeenCalledTimes(1)
    })

    it('disables sync and links to Settings when Lyfta is not connected', () => {
        mocks.connectionQuery.data = { connected: false, lastSyncedAt: null }
        render(<ActivityActions />)

        expect(screen.getByTestId('activity-sync-lyfta')).toBeDisabled()
        expect(screen.getByTestId('activity-sync-connect-prompt')).toBeInTheDocument()
        expect(screen.getByTestId('activity-sync-connect-link')).toHaveAttribute(
            'href',
            '/settings'
        )
    })

    it('shows sync success and error feedback', () => {
        mocks.lyfta.syncResult = {
            created: 3,
            updated: 2,
            lastSyncedAt: '2026-11-20T08:30:00.000Z',
        }
        mocks.lyfta.errorMessage = 'Lyfta is rate limiting requests.'
        render(<ActivityActions />)

        expect(screen.getByTestId('activity-sync-success')).toHaveTextContent(
            '3 workouts added and 2 updated.'
        )
        expect(screen.getByTestId('activity-sync-error')).toHaveTextContent(
            'Lyfta is rate limiting requests.'
        )
    })
})
