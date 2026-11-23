import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { SYNC_START_MESSAGE, type SyncStatus } from '@/_bff/core/constants/sync.constants'
import {
    ZEPP_SYNC_IN_PROGRESS_MESSAGE,
    type ZeppSyncResult,
} from '@/_bff/core/constants/zepp.constants'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { SyncIntegrations } from '@/components/sync-integrations'
import { useSyncZepp } from '@/modules/zepp/use-sync-zepp'
import type { TrpcKeyed } from '@/lib/__mocks__/trpc-path'

type Sync = {
    status: SyncStatus
    startedAt: string | null
    finishedAt: string | null
    result: ZeppSyncResult | null
    errorCode: string | null
}
type Status = { connected: boolean; lastSyncedAt: string | null; sync: Sync }
type QueryOptions = TrpcKeyed & {
    refetchInterval?: (query: { state: { data: Status | undefined } }) => number | false
}

const mocks = vi.hoisted(() => {
    const data: Status = {
        connected: true,
        lastSyncedAt: null,
        sync: { status: 'idle', startedAt: null, finishedAt: null, result: null, errorCode: null },
    }
    const statusOptions: QueryOptions[] = []
    return {
        statusQuery: { data, isPending: false, isError: false },
        statusOptions,
        sync: { mutateAsync: vi.fn(), reset: vi.fn(), isPending: false },
        invalidateStatus: vi.fn(),
        invalidateCalendar: vi.fn(),
        invalidateRunProgress: vi.fn(),
        success: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
    }
})

vi.mock('@/lib/trpc', () => import('@/lib/__mocks__/trpc'))
vi.mock('sonner', () => ({
    toast: { success: mocks.success, info: mocks.info, error: mocks.error },
}))
vi.mock('@tanstack/react-query', async (importOriginal) => {
    const { routeTrpc } = await import('@/lib/__mocks__/trpc-path')
    return {
        ...(await importOriginal<typeof import('@tanstack/react-query')>()),
        useQuery: (options: QueryOptions) =>
            routeTrpc(
                {
                    'zepp.getConnectionStatus': () => {
                        mocks.statusOptions.push(options)
                        return mocks.statusQuery
                    },
                },
                options
            ),
        useMutation: (options: TrpcKeyed) =>
            routeTrpc({ 'zepp.syncActivities': () => mocks.sync }, options),
        useQueryClient: () => ({
            invalidateQueries: (filter: TrpcKeyed) =>
                routeTrpc(
                    {
                        'zepp.getConnectionStatus': mocks.invalidateStatus,
                        'training.getCalendar': mocks.invalidateCalendar,
                        'training.getRunProgress': mocks.invalidateRunProgress,
                    },
                    filter
                ),
        }),
    }
})

const sync = (overrides: Partial<Sync> = {}): Sync => ({
    status: 'idle',
    startedAt: null,
    finishedAt: null,
    result: null,
    errorCode: null,
    ...overrides,
})

const setStatus = (overrides: Partial<Sync> = {}) => {
    mocks.statusQuery.data = {
        connected: true,
        lastSyncedAt: '2026-11-21T10:00:00.000Z',
        sync: sync(overrides),
    }
}

const RESULT: ZeppSyncResult = { imported: 2, skipped: 0, updated: 0, remaining: 0 }

function SyncButton() {
    return <SyncIntegrations sources={[useSyncZepp()]} />
}

describe('useSyncZepp', () => {
    beforeEach(() => {
        vi.stubGlobal('matchMedia', () => ({
            matches: false,
            addEventListener: () => {},
            removeEventListener: () => {},
        }))
        vi.clearAllMocks()
        mocks.statusOptions.length = 0
        setStatus()
        mocks.statusQuery.isPending = false
        mocks.statusQuery.isError = false
        mocks.invalidateStatus.mockResolvedValue(null)
        mocks.invalidateCalendar.mockResolvedValue(null)
        mocks.invalidateRunProgress.mockResolvedValue(null)
        mocks.sync.mutateAsync.mockResolvedValue({ startedAt: 't1' })
    })

    it('reports the connection as a status', () => {
        const connected = renderHook(() => useSyncZepp()).result.current
        expect(connected).toMatchObject({
            id: 'zepp',
            name: 'Zepp',
            status: 'connected',
            lastSyncedAt: '2026-11-21T10:00:00.000Z',
        })

        mocks.statusQuery.data = { connected: false, lastSyncedAt: null, sync: sync() }
        expect(renderHook(() => useSyncZepp()).result.current.status).toBe('disconnected')

        mocks.statusQuery.isPending = true
        expect(renderHook(() => useSyncZepp()).result.current.status).toBe('loading')

        mocks.statusQuery.isPending = false
        mocks.statusQuery.isError = true
        expect(renderHook(() => useSyncZepp()).result.current.status).toBe('error')
    })

    it('shows the start toast when the Zepp row is pressed and refreshes the status', async () => {
        render(<SyncButton />)
        fireEvent.click(screen.getByTestId('sync-integrations-button'))
        fireEvent.click(await screen.findByTestId('sync-source-zepp'))

        await waitFor(() => {
            expect(mocks.info).toHaveBeenCalledWith(SYNC_START_MESSAGE)
        })
        expect(mocks.sync.mutateAsync).toHaveBeenCalledTimes(1)
        expect(mocks.invalidateStatus).toHaveBeenCalled()
        expect(mocks.success).not.toHaveBeenCalled()
    })

    it('polls the status only while a sync is running', () => {
        renderHook(() => useSyncZepp())
        const options = mocks.statusOptions.at(-1)
        const running: Status = {
            connected: true,
            lastSyncedAt: null,
            sync: sync({ status: 'running', startedAt: 't1' }),
        }

        expect(options?.refetchInterval?.({ state: { data: running } })).toBe(5000)
        expect(options?.refetchInterval?.({ state: { data: mocks.statusQuery.data } })).toBe(false)
    })

    it('toasts the result once after this tab saw the sync running and refreshes the calendar', async () => {
        setStatus({ status: 'running', startedAt: 't1' })
        const { rerender } = renderHook(() => useSyncZepp())
        expect(mocks.invalidateCalendar).not.toHaveBeenCalled()

        setStatus({ status: 'succeeded', startedAt: 't1', result: RESULT })
        rerender()
        setStatus({ status: 'succeeded', startedAt: 't1', result: RESULT })
        rerender()

        await waitFor(() => {
            expect(mocks.invalidateCalendar).toHaveBeenCalledTimes(1)
        })
        expect(mocks.invalidateRunProgress).toHaveBeenCalledTimes(1)
        expect(mocks.success).toHaveBeenCalledTimes(1)
        expect(mocks.success).toHaveBeenCalledWith('Zepp synced: Imported 2 runs.')
    })

    it('asks to press Sync again while there is more to import', () => {
        setStatus({ status: 'running', startedAt: 't1' })
        const { rerender } = renderHook(() => useSyncZepp())

        setStatus({
            status: 'succeeded',
            startedAt: 't1',
            result: { imported: 50, skipped: 0, updated: 0, remaining: 4 },
        })
        rerender()

        expect(mocks.info).toHaveBeenCalledWith(
            'Imported 50 runs. More runs to sync. Press Sync again to continue.'
        )
    })

    it('shows no toast when the page loads after the sync ended', () => {
        setStatus({ status: 'succeeded', startedAt: 't1', result: RESULT })
        const { rerender } = renderHook(() => useSyncZepp())
        rerender()

        expect(mocks.success).not.toHaveBeenCalled()
        expect(mocks.info).not.toHaveBeenCalled()
        expect(mocks.invalidateCalendar).not.toHaveBeenCalled()
    })

    it('shows why a sync failed after it ran', () => {
        setStatus({ status: 'running', startedAt: 't1' })
        const { rerender } = renderHook(() => useSyncZepp())

        setStatus({ status: 'failed', startedAt: 't1', errorCode: ErrorCode.ZEPP_SESSION_EXPIRED })
        rerender()

        expect(mocks.error).toHaveBeenCalledWith('Your Zepp session expired. Sign in again.')
    })

    it('shows why a sync failed even when it ended before the status ever read running', async () => {
        mocks.sync.mutateAsync.mockResolvedValue({ startedAt: '2026-11-23T10:00:00.000Z' })
        const { rerender } = render(<SyncButton />)
        fireEvent.click(screen.getByTestId('sync-integrations-button'))
        fireEvent.click(await screen.findByTestId('sync-source-zepp'))
        await waitFor(() => {
            expect(mocks.info).toHaveBeenCalledWith(SYNC_START_MESSAGE)
        })

        setStatus({
            status: 'failed',
            startedAt: '2026-11-23T10:00:00.000+00:00',
            errorCode: ErrorCode.ZEPP_SESSION_EXPIRED,
        })
        rerender(<SyncButton />)

        await waitFor(() => {
            expect(mocks.error).toHaveBeenCalledWith('Your Zepp session expired. Sign in again.')
        })
        expect(mocks.error).toHaveBeenCalledTimes(1)
    })

    it('keeps the spinner after a remount while the sync runs', async () => {
        setStatus({ status: 'running', startedAt: 't1' })
        const { unmount } = render(<SyncButton />)
        unmount()
        render(<SyncButton />)
        fireEvent.click(screen.getByTestId('sync-integrations-button'))

        expect(await screen.findByTestId('sync-source-zepp')).toBeDisabled()
        expect(screen.getByTestId('sync-source-zepp-spinner')).toBeInTheDocument()
    })

    it('shows the in-progress message as info and keeps polling on a refused overlap', async () => {
        mocks.sync.mutateAsync.mockRejectedValue(new Error(ZEPP_SYNC_IN_PROGRESS_MESSAGE))
        const { result } = renderHook(() => useSyncZepp())

        await act(async () => {
            await result.current.sync()
        })

        expect(mocks.info).toHaveBeenCalledWith(ZEPP_SYNC_IN_PROGRESS_MESSAGE)
        expect(mocks.error).not.toHaveBeenCalled()
        expect(mocks.invalidateStatus).toHaveBeenCalled()
    })

    it('shows an error when the sync could not start', async () => {
        mocks.sync.mutateAsync.mockRejectedValue(new Error(ErrorCode.ZEPP_SYNC_ENQUEUE))
        const { result } = renderHook(() => useSyncZepp())

        await act(async () => {
            await result.current.sync()
        })

        expect(mocks.error).toHaveBeenCalledWith('Could not start the Zepp sync. Try again.')
        expect(mocks.info).not.toHaveBeenCalled()
    })
})
