import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LYFTA_SYNC_IN_PROGRESS_MESSAGE } from '@/_bff/core/constants/lyfta.constants'
import { LyftaCard } from '@/modules/lyfta/lyfta-card'
import type { TrpcKeyed } from '@/lib/__mocks__/trpc-path'

type Sync = { status: string; startedAt: string | null }
type Status = {
    connected: boolean
    lastSyncedAt: string
    sync: Sync & { finishedAt: null; result: null; errorCode: null }
}
type StatusQuery = { data: Status | undefined; isPending: boolean; isError: boolean }
type CountQuery = { data: { count: number } | undefined; isError: boolean }

const IDLE = { status: 'idle', startedAt: null, finishedAt: null, result: null, errorCode: null }

const mocks = vi.hoisted(() => {
    const statusQuery: StatusQuery = {
        data: undefined,
        isPending: false,
        isError: false,
    }
    const countQuery: CountQuery = {
        data: { count: 142 },
        isError: false,
    }
    return {
        toastError: vi.fn(),
        statusQuery,
        countQuery,
        idle: { mutateAsync: vi.fn(), reset: vi.fn(), isPending: false },
        clear: { mutateAsync: vi.fn(), reset: vi.fn(), isPending: false },
        invalidate: vi.fn(),
        invalidateCount: vi.fn(),
        invalidateCalendar: vi.fn(),
        invalidateStrength: vi.fn(),
        success: vi.fn(),
    }
})

vi.mock('sonner', () => ({
    toast: { info: vi.fn(), error: mocks.toastError, success: mocks.success },
}))
vi.mock('@/lib/trpc', () => import('@/lib/__mocks__/trpc'))
vi.mock('@tanstack/react-query', async (importOriginal) => {
    const { routeTrpc } = await import('@/lib/__mocks__/trpc-path')
    return {
        ...(await importOriginal<typeof import('@tanstack/react-query')>()),
        useQuery: (options: TrpcKeyed) =>
            routeTrpc(
                {
                    'lyfta.getConnectionStatus': () => mocks.statusQuery,
                    'lyfta.getActivityCount': () => mocks.countQuery,
                },
                options
            ),
        useMutation: (options: TrpcKeyed) =>
            routeTrpc(
                {
                    'lyfta.connect': () => mocks.idle,
                    'lyfta.syncWorkouts': () => mocks.idle,
                    'lyfta.disconnect': () => mocks.idle,
                    'lyfta.clearActivities': () => mocks.clear,
                },
                options
            ),
        useQueryClient: () => ({
            invalidateQueries: (filter: TrpcKeyed) =>
                routeTrpc(
                    {
                        'lyfta.getConnectionStatus': mocks.invalidate,
                        'lyfta.getActivityCount': mocks.invalidateCount,
                        'training.getCalendar': mocks.invalidateCalendar,
                        'training.getStrengthProgress': mocks.invalidateStrength,
                    },
                    filter
                ),
        }),
    }
})

const connected = (sync: Partial<Sync> = {}) => {
    mocks.statusQuery.data = { connected: true, lastSyncedAt: '', sync: { ...IDLE, ...sync } }
}

describe('LyftaCard clear activities', () => {
    beforeEach(() => {
        vi.stubGlobal('matchMedia', () => ({
            matches: false,
            addEventListener: () => {},
            removeEventListener: () => {},
        }))
        vi.clearAllMocks()
        mocks.countQuery.data = { count: 142 }
        mocks.clear.mutateAsync.mockResolvedValue({ deleted: 3 })
        mocks.invalidate.mockResolvedValue(null)
        mocks.invalidateCount.mockResolvedValue(null)
        mocks.invalidateCalendar.mockResolvedValue(null)
        mocks.invalidateStrength.mockResolvedValue(null)
    })

    it('shows the connection state and how many workouts were imported', () => {
        connected()
        render(<LyftaCard />)

        expect(screen.getByTestId('lyfta-status-pill')).toHaveTextContent('Connected')
        expect(screen.getByTestId('lyfta-imported-count')).toHaveTextContent(
            '142 workouts imported'
        )
    })

    it('asks before clearing and then clears, toasts and refreshes the training views', async () => {
        connected()
        render(<LyftaCard />)

        fireEvent.click(screen.getByTestId('lyfta-clear'))
        expect(screen.getByTestId('lyfta-clear-dialog')).toHaveTextContent(
            'Clear 142 Lyfta workouts?'
        )
        expect(mocks.clear.mutateAsync).not.toHaveBeenCalled()

        fireEvent.click(screen.getByTestId('lyfta-clear-confirm'))

        await waitFor(() => {
            expect(mocks.success).toHaveBeenCalledWith('Cleared 3 Lyfta workouts.')
        })
        expect(mocks.clear.mutateAsync).toHaveBeenCalledTimes(1)
        expect(screen.queryByTestId('lyfta-clear-dialog')).toBeNull()
        expect(mocks.invalidateCount).toHaveBeenCalled()
        expect(mocks.invalidate).toHaveBeenCalled()
        expect(mocks.invalidateCalendar).toHaveBeenCalled()
        expect(mocks.invalidateStrength).toHaveBeenCalled()
    })

    it('sends one request when the confirm button is pressed twice', async () => {
        connected()
        let finish: ((value: { deleted: number }) => void) | undefined
        mocks.clear.mutateAsync.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve
                })
        )
        render(<LyftaCard />)
        fireEvent.click(screen.getByTestId('lyfta-clear'))

        fireEvent.click(screen.getByTestId('lyfta-clear-confirm'))
        fireEvent.click(screen.getByTestId('lyfta-clear-confirm'))

        expect(mocks.clear.mutateAsync).toHaveBeenCalledTimes(1)
        expect(screen.getByTestId('lyfta-clear-confirm')).toBeDisabled()
        finish?.({ deleted: 1 })
        await waitFor(() => expect(mocks.success).toHaveBeenCalled())
    })

    it('keeps the dialog open and toasts the reason when clearing fails', async () => {
        connected()
        mocks.clear.mutateAsync.mockRejectedValueOnce(new Error(LYFTA_SYNC_IN_PROGRESS_MESSAGE))
        render(<LyftaCard />)
        fireEvent.click(screen.getByTestId('lyfta-clear'))

        fireEvent.click(screen.getByTestId('lyfta-clear-confirm'))

        await waitFor(() => {
            expect(mocks.toastError).toHaveBeenCalledWith('A Lyfta sync is already running')
        })
        expect(screen.queryByTestId('lyfta-clear-error')).toBeNull()
        expect(screen.getByTestId('lyfta-clear-dialog')).toBeInTheDocument()
        expect(mocks.success).not.toHaveBeenCalled()
    })

    it('cannot clear with no activities, an unknown count or a sync running', () => {
        connected()
        mocks.countQuery.data = { count: 0 }
        const { rerender } = render(<LyftaCard />)
        expect(screen.getByTestId('lyfta-clear')).toBeDisabled()

        mocks.countQuery.data = undefined
        rerender(<LyftaCard />)
        expect(screen.getByTestId('lyfta-clear')).toBeDisabled()

        mocks.countQuery.data = { count: 5 }
        connected({ status: 'running', startedAt: 't1' })
        rerender(<LyftaCard />)
        expect(screen.getByTestId('lyfta-clear')).toBeDisabled()
    })
})
