import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { SYNC_START_MESSAGE, type SyncStatus } from '@/_bff/core/constants/sync.constants'
import {
    LYFTA_SYNC_IN_PROGRESS_MESSAGE,
    type LyftaSyncResult,
} from '@/_bff/core/constants/lyfta.constants'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { SyncIntegrations } from '@/components/sync-integrations'
import { useSyncLyfta } from '@/modules/lyfta/use-sync-lyfta'
import type { TrpcKeyed } from '@/lib/__mocks__/trpc-path'

type Sync = {
    status: SyncStatus
    startedAt: string | null
    finishedAt: string | null
    result: LyftaSyncResult | null
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
        invalidateStrength: vi.fn(),
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
                    'lyfta.getConnectionStatus': () => {
                        mocks.statusOptions.push(options)
                        return mocks.statusQuery
                    },
                },
                options
            ),
        useMutation: (options: TrpcKeyed) =>
            routeTrpc({ 'lyfta.syncWorkouts': () => mocks.sync }, options),
        useQueryClient: () => ({
            invalidateQueries: (filter: TrpcKeyed) =>
                routeTrpc(
                    {
                        'lyfta.getConnectionStatus': mocks.invalidateStatus,
                        'training.getCalendar': mocks.invalidateCalendar,
                        'training.getStrengthProgress': mocks.invalidateStrength,
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

const RESULT: LyftaSyncResult = { created: 120, updated: 4, hasMore: false }

function SyncButton() {
    return <SyncIntegrations sources={[useSyncLyfta()]} />
}

describe('useSyncLyfta', () => {
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
        mocks.invalidateStrength.mockResolvedValue(null)
        mocks.sync.mutateAsync.mockResolvedValue({ startedAt: 't1' })
    })

    it('reports the connection as a status', () => {
        const connected = renderHook(() => useSyncLyfta()).result.current
        expect(connected).toMatchObject({
            id: 'lyfta',
            name: 'Lyfta',
            status: 'connected',
            lastSyncedAt: '2026-11-21T10:00:00.000Z',
        })

        mocks.statusQuery.data = { connected: false, lastSyncedAt: null, sync: sync() }
        expect(renderHook(() => useSyncLyfta()).result.current.status).toBe('disconnected')

        mocks.statusQuery.isPending = true
        expect(renderHook(() => useSyncLyfta()).result.current.status).toBe('loading')

        mocks.statusQuery.isPending = false
        mocks.statusQuery.isError = true
        expect(renderHook(() => useSyncLyfta()).result.current.status).toBe('error')
    })

    it('shows the start toast when the Lyfta row is pressed and refreshes the status', async () => {
        render(<SyncButton />)
        fireEvent.click(screen.getByTestId('sync-integrations-button'))
        fireEvent.click(await screen.findByTestId('sync-source-lyfta'))

        await waitFor(() => {
            expect(mocks.info).toHaveBeenCalledWith(SYNC_START_MESSAGE)
        })
        expect(mocks.sync.mutateAsync).toHaveBeenCalledTimes(1)
        expect(mocks.invalidateStatus).toHaveBeenCalled()
        expect(mocks.success).not.toHaveBeenCalled()
    })

    it('polls the status only while a sync is running', () => {
        renderHook(() => useSyncLyfta())
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
        const { rerender } = renderHook(() => useSyncLyfta())
        expect(mocks.invalidateCalendar).not.toHaveBeenCalled()

        setStatus({ status: 'succeeded', startedAt: 't1', result: RESULT })
        rerender()
        setStatus({ status: 'succeeded', startedAt: 't1', result: RESULT })
        rerender()

        await waitFor(() => {
            expect(mocks.invalidateCalendar).toHaveBeenCalledTimes(1)
        })
        expect(mocks.invalidateStrength).toHaveBeenCalledTimes(1)
        expect(mocks.success).toHaveBeenCalledTimes(1)
        expect(mocks.success).toHaveBeenCalledWith(
            'Lyfta synced: 120 workouts added and 4 updated.'
        )
    })

    it('asks to press Sync again while there is more to import', () => {
        setStatus({ status: 'running', startedAt: 't1' })
        const { rerender } = renderHook(() => useSyncLyfta())

        setStatus({
            status: 'succeeded',
            startedAt: 't1',
            result: { created: 50, updated: 0, hasMore: true },
        })
        rerender()

        expect(mocks.info).toHaveBeenCalledWith(
            '50 workouts added and 0 updated. More workouts to sync. Press Sync workouts again to continue.'
        )
    })

    it('shows no toast when the page loads after the sync ended', () => {
        setStatus({ status: 'succeeded', startedAt: 't1', result: RESULT })
        const { rerender } = renderHook(() => useSyncLyfta())
        rerender()

        expect(mocks.success).not.toHaveBeenCalled()
        expect(mocks.info).not.toHaveBeenCalled()
        expect(mocks.invalidateCalendar).not.toHaveBeenCalled()
    })

    it('shows why a sync failed after it ran', () => {
        setStatus({ status: 'running', startedAt: 't1' })
        const { rerender } = renderHook(() => useSyncLyfta())

        setStatus({ status: 'failed', startedAt: 't1', errorCode: ErrorCode.LYFTA_RATE_LIMIT })
        rerender()

        expect(mocks.error).toHaveBeenCalledWith(
            'Lyfta is rate limiting requests. Wait before trying again.'
        )
    })

    it('keeps the spinner after a remount while the sync runs', async () => {
        setStatus({ status: 'running', startedAt: 't1' })
        const { unmount } = render(<SyncButton />)
        unmount()
        render(<SyncButton />)
        fireEvent.click(screen.getByTestId('sync-integrations-button'))

        expect(await screen.findByTestId('sync-source-lyfta')).toBeDisabled()
        expect(screen.getByTestId('sync-source-lyfta-spinner')).toBeInTheDocument()
    })

    it('shows the in-progress message as info and keeps polling on a refused overlap', async () => {
        mocks.sync.mutateAsync.mockRejectedValue(new Error(LYFTA_SYNC_IN_PROGRESS_MESSAGE))
        const { result } = renderHook(() => useSyncLyfta())

        await act(async () => {
            await result.current.sync()
        })

        expect(mocks.info).toHaveBeenCalledWith(LYFTA_SYNC_IN_PROGRESS_MESSAGE)
        expect(mocks.error).not.toHaveBeenCalled()
        expect(mocks.invalidateStatus).toHaveBeenCalled()
    })

    it('shows an error when the sync could not start', async () => {
        mocks.sync.mutateAsync.mockRejectedValue(new Error(ErrorCode.LYFTA_SYNC_ENQUEUE))
        const { result } = renderHook(() => useSyncLyfta())

        await act(async () => {
            await result.current.sync()
        })

        expect(mocks.error).toHaveBeenCalledWith('Could not start the Lyfta sync. Try again.')
        expect(mocks.info).not.toHaveBeenCalled()
    })
})
