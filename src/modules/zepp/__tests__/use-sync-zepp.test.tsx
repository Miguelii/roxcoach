import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { useSyncZepp } from '@/modules/zepp/use-sync-zepp'
import type { TrpcKeyed } from '@/lib/__mocks__/trpc-path'

type Status = { connected: boolean; lastSyncedAt: string | null }

const mocks = vi.hoisted(() => {
    const data: Status = { connected: true, lastSyncedAt: '2026-11-21T10:00:00.000Z' }
    return {
        statusQuery: { data, isPending: false, isError: false },
        sync: { mutateAsync: vi.fn(), reset: vi.fn(), isPending: false },
        invalidate: vi.fn(),
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
        useQuery: (options: TrpcKeyed) =>
            routeTrpc({ 'zepp.getConnectionStatus': () => mocks.statusQuery }, options),
        useMutation: (options: TrpcKeyed) =>
            routeTrpc({ 'zepp.syncActivities': () => mocks.sync }, options),
        useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
    }
})

describe('useSyncZepp', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.statusQuery.data = { connected: true, lastSyncedAt: '2026-11-21T10:00:00.000Z' }
        mocks.statusQuery.isPending = false
        mocks.statusQuery.isError = false
        mocks.invalidate.mockResolvedValue(null)
        mocks.sync.mutateAsync.mockResolvedValue({
            imported: 2,
            skipped: 0,
            updated: 0,
            remaining: 0,
        })
    })

    it('reports the connection as a status', () => {
        const connected = renderHook(() => useSyncZepp()).result.current
        expect(connected).toMatchObject({
            id: 'zepp',
            name: 'Zepp',
            status: 'connected',
            lastSyncedAt: '2026-11-21T10:00:00.000Z',
        })

        mocks.statusQuery.data = { connected: false, lastSyncedAt: null }
        expect(renderHook(() => useSyncZepp()).result.current.status).toBe('disconnected')

        mocks.statusQuery.isPending = true
        expect(renderHook(() => useSyncZepp()).result.current.status).toBe('loading')

        mocks.statusQuery.isPending = false
        mocks.statusQuery.isError = true
        expect(renderHook(() => useSyncZepp()).result.current.status).toBe('error')
    })

    it('syncs and tells what was imported in a toast', async () => {
        const { result } = renderHook(() => useSyncZepp())

        await act(async () => {
            await result.current.sync()
        })

        expect(mocks.sync.mutateAsync).toHaveBeenCalledTimes(1)
        expect(mocks.success).toHaveBeenCalledWith('Zepp synced: Imported 2 runs.')
    })

    it('asks to press Sync again while there is more to import', async () => {
        mocks.sync.mutateAsync.mockResolvedValue({
            imported: 50,
            skipped: 0,
            updated: 0,
            remaining: 4,
        })
        const { result } = renderHook(() => useSyncZepp())

        await act(async () => {
            await result.current.sync()
        })

        expect(mocks.info).toHaveBeenCalledWith(
            'Imported 50 runs. More runs to sync. Press Sync again to continue.'
        )
    })

    it('shows why a sync failed', async () => {
        mocks.sync.mutateAsync.mockRejectedValue(new Error(ErrorCode.ZEPP_SESSION_EXPIRED))
        const { result } = renderHook(() => useSyncZepp())

        await act(async () => {
            await result.current.sync()
        })

        expect(mocks.error).toHaveBeenCalledWith('Your Zepp session expired. Sign in again.')
    })
})
