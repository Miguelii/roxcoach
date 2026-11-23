import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LYFTA_SYNC_IN_PROGRESS_MESSAGE } from '@/_bff/core/constants/lyfta.constants'
import type { LyftaSyncResult } from '@/_bff/core/constants/lyfta.constants'
import { SYNC_START_MESSAGE, type SyncStatus } from '@/_bff/core/constants/sync.constants'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { LyftaCard } from '@/modules/lyfta/lyfta-card'
import type { TrpcKeyed } from '@/lib/__mocks__/trpc-path'

type Sync = {
    status: SyncStatus
    startedAt: string | null
    finishedAt: string | null
    result: LyftaSyncResult | null
    errorCode: string | null
}
type Status = { connected: boolean; lastSyncedAt: string; sync: Sync }
type QueryOptions = TrpcKeyed & {
    refetchInterval?: (query: { state: { data: Status | undefined } }) => number | false
}

const IDLE: Sync = {
    status: 'idle',
    startedAt: null,
    finishedAt: null,
    result: null,
    errorCode: null,
}

const mocks = vi.hoisted(() => {
    const data: Status = {
        connected: false,
        lastSyncedAt: '',
        sync: { status: 'idle', startedAt: null, finishedAt: null, result: null, errorCode: null },
    }
    const statusOptions: QueryOptions[] = []
    return {
        statusQuery: { data, isPending: false, isError: false, refetch: vi.fn() },
        statusOptions,
        invalidate: vi.fn(),
        invalidateCalendar: vi.fn(),
        invalidateStrength: vi.fn(),
        connect: { mutateAsync: vi.fn(), reset: vi.fn(), isPending: false },
        sync: { mutateAsync: vi.fn(), reset: vi.fn(), isPending: false },
        disconnect: { mutateAsync: vi.fn(), reset: vi.fn(), isPending: false },
        info: vi.fn(),
        error: vi.fn(),
    }
})

vi.mock('sonner', () => ({ toast: { info: mocks.info, error: mocks.error } }))

vi.mock('@/lib/trpc', () => import('@/lib/__mocks__/trpc'))
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
            routeTrpc(
                {
                    'lyfta.connect': () => mocks.connect,
                    'lyfta.syncWorkouts': () => mocks.sync,
                    'lyfta.disconnect': () => mocks.disconnect,
                },
                options
            ),
        useQueryClient: () => ({
            invalidateQueries: (filter: TrpcKeyed) =>
                routeTrpc(
                    {
                        'lyfta.getConnectionStatus': mocks.invalidate,
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

describe('LyftaCard', () => {
    beforeEach(() => {
        // jsdom has no matchMedia; the confirm dialog reads it through useIsMobile (desktop here).
        vi.stubGlobal('matchMedia', () => ({
            matches: false,
            addEventListener: () => {},
            removeEventListener: () => {},
        }))
        vi.clearAllMocks()
        mocks.statusOptions.length = 0
        mocks.statusQuery.data = { connected: false, lastSyncedAt: '', sync: IDLE }
        mocks.statusQuery.isPending = false
        mocks.statusQuery.isError = false
        mocks.connect.isPending = false
        mocks.sync.isPending = false
        mocks.disconnect.isPending = false
        mocks.connect.mutateAsync.mockResolvedValue({
            connected: true,
            lastSyncedAt: null,
        })
        mocks.sync.mutateAsync.mockResolvedValue({ startedAt: 't1' })
        mocks.disconnect.mutateAsync.mockResolvedValue(null)
        mocks.invalidate.mockResolvedValue(null)
        mocks.invalidateCalendar.mockResolvedValue(null)
        mocks.invalidateStrength.mockResolvedValue(null)
    })

    it('shows the API key while the eye is pressed, with a label that names the key', () => {
        render(<LyftaCard />)

        expect(screen.getByTestId('lyfta-api-key-toggle')).toHaveAttribute(
            'aria-label',
            'Show API key'
        )
        fireEvent.click(screen.getByTestId('lyfta-api-key-toggle'))
        expect(screen.getByTestId('lyfta-api-key')).toHaveAttribute('type', 'text')
        expect(screen.getByTestId('lyfta-api-key-toggle')).toHaveAttribute(
            'aria-label',
            'Hide API key'
        )
    })

    it('shows an empty password field and validates before connecting', async () => {
        render(<LyftaCard />)

        expect(screen.getByTestId('lyfta-api-key')).toHaveAttribute('type', 'password')
        expect(screen.getByTestId('lyfta-api-key')).toHaveValue('')
        fireEvent.submit(screen.getByTestId('lyfta-key-form'))

        await waitFor(() => {
            expect(screen.getByTestId('lyfta-api-key-error')).toBeInTheDocument()
        })
        expect(mocks.connect.mutateAsync).not.toHaveBeenCalled()
    })

    it('saves the key, clears the input and refreshes the connection status', async () => {
        render(<LyftaCard />)
        fireEvent.change(screen.getByTestId('lyfta-api-key'), {
            target: { value: 'personal-key' },
        })
        fireEvent.submit(screen.getByTestId('lyfta-key-form'))

        await waitFor(() => {
            expect(mocks.connect.mutateAsync).toHaveBeenCalledWith({ apiKey: 'personal-key' })
            expect(mocks.invalidate).toHaveBeenCalledTimes(1)
        })
        expect(screen.getByTestId('lyfta-api-key')).toHaveValue('')
    })

    it('shows a categorized connection error without clearing the entered key', async () => {
        mocks.connect.mutateAsync.mockRejectedValue(new Error(ErrorCode.LYFTA_CREDENTIAL))
        render(<LyftaCard />)
        fireEvent.change(screen.getByTestId('lyfta-api-key'), {
            target: { value: 'rejected-key' },
        })
        fireEvent.submit(screen.getByTestId('lyfta-key-form'))

        await waitFor(() => {
            expect(screen.getByTestId('lyfta-error')).toHaveTextContent(
                'Lyfta did not accept this API key.'
            )
        })
        expect(screen.getByTestId('lyfta-api-key')).toHaveValue('rejected-key')
    })

    it('starts a sync, refreshes the status and reports an enqueue error', async () => {
        connected()
        render(<LyftaCard />)
        fireEvent.click(screen.getByTestId('lyfta-sync'))

        await waitFor(() => {
            expect(mocks.sync.mutateAsync).toHaveBeenCalledTimes(1)
            expect(mocks.invalidate).toHaveBeenCalled()
        })
        expect(screen.queryByTestId('lyfta-sync-success')).toBeNull()
        expect(screen.queryByTestId('lyfta-error')).toBeNull()

        mocks.sync.mutateAsync.mockRejectedValueOnce(new Error(ErrorCode.LYFTA_SYNC_ENQUEUE))
        fireEvent.click(screen.getByTestId('lyfta-sync'))
        await waitFor(() => {
            expect(screen.getByTestId('lyfta-error')).toHaveTextContent(
                'Could not start the Lyfta sync. Try again.'
            )
        })
    })

    it('toasts that the sync started and that a running one is already in progress', async () => {
        connected()
        render(<LyftaCard />)
        fireEvent.click(screen.getByTestId('lyfta-sync'))
        await waitFor(() => expect(mocks.info).toHaveBeenCalledWith(SYNC_START_MESSAGE))

        mocks.sync.mutateAsync.mockRejectedValueOnce(new Error(LYFTA_SYNC_IN_PROGRESS_MESSAGE))
        fireEvent.click(screen.getByTestId('lyfta-sync'))
        await waitFor(() => expect(mocks.info).toHaveBeenCalledWith(LYFTA_SYNC_IN_PROGRESS_MESSAGE))
        expect(mocks.error).not.toHaveBeenCalled()
    })

    it('polls the status only while a sync is running', () => {
        connected()
        render(<LyftaCard />)
        const options = mocks.statusOptions.at(-1)
        const running: Status = {
            connected: true,
            lastSyncedAt: '',
            sync: { ...IDLE, status: 'running', startedAt: 't1' },
        }

        expect(options?.refetchInterval?.({ state: { data: running } })).toBe(5000)
        expect(options?.refetchInterval?.({ state: { data: mocks.statusQuery.data } })).toBe(false)
    })

    it('reports the counts when the sync it saw running ends and refreshes the training views', async () => {
        connected({ status: 'running', startedAt: 't1' })
        const { rerender } = render(<LyftaCard />)

        connected({
            status: 'succeeded',
            startedAt: 't1',
            result: { created: 2, updated: 1, hasMore: false },
        })
        rerender(<LyftaCard />)

        expect(screen.getByTestId('lyfta-sync-success')).toHaveTextContent(
            '2 workouts added and 1 updated.'
        )
        await waitFor(() => {
            expect(mocks.invalidateCalendar).toHaveBeenCalledTimes(1)
            expect(mocks.invalidateStrength).toHaveBeenCalledTimes(1)
        })
    })

    it('asks to sync again when the last sync left more workouts', () => {
        connected({
            status: 'succeeded',
            startedAt: 't1',
            result: { created: 3, updated: 0, hasMore: true },
        })
        render(<LyftaCard />)

        expect(screen.getByTestId('lyfta-sync-more')).toHaveTextContent(
            'More workouts to sync. Press Sync workouts again to continue.'
        )
        expect(screen.queryByTestId('lyfta-sync-success')).toBeNull()
    })

    it('shows the last failed sync from the status', () => {
        connected({ status: 'failed', startedAt: 't1', errorCode: ErrorCode.LYFTA_RATE_LIMIT })
        render(<LyftaCard />)

        expect(screen.getByTestId('lyfta-error')).toHaveTextContent(
            'Lyfta is rate limiting requests.'
        )
    })

    it('shows the spinner and blocks another sync while one runs', () => {
        connected({ status: 'running', startedAt: 't1' })
        render(<LyftaCard />)

        expect(screen.getByTestId('lyfta-sync')).toBeDisabled()
        expect(screen.getByTestId('lyfta-sync-spinner')).toBeInTheDocument()
    })

    it('does not treat a refused overlapping sync as an error and refreshes the status', async () => {
        connected()
        mocks.sync.mutateAsync.mockRejectedValueOnce(new Error(LYFTA_SYNC_IN_PROGRESS_MESSAGE))
        render(<LyftaCard />)
        fireEvent.click(screen.getByTestId('lyfta-sync'))

        await waitFor(() => {
            expect(mocks.invalidate).toHaveBeenCalled()
        })
        expect(screen.queryByTestId('lyfta-error')).toBeNull()
    })

    it('disables another sync while a request is pending', () => {
        connected()
        mocks.sync.isPending = true
        render(<LyftaCard />)

        expect(screen.getByTestId('lyfta-sync')).toBeDisabled()
        fireEvent.click(screen.getByTestId('lyfta-sync'))
        expect(mocks.sync.mutateAsync).not.toHaveBeenCalled()
    })

    it('asks in a dialog before disconnecting, and Keep connected closes it without disconnecting', async () => {
        connected()
        render(<LyftaCard />)

        fireEvent.click(screen.getByTestId('lyfta-disconnect'))
        expect(await screen.findByTestId('lyfta-disconnect-dialog')).toHaveAttribute(
            'role',
            'alertdialog'
        )
        expect(screen.getByTestId('lyfta-disconnect-dialog')).toHaveTextContent('Disconnect Lyfta?')
        fireEvent.click(screen.getByTestId('lyfta-disconnect-cancel'))
        await waitFor(() => {
            expect(screen.queryByTestId('lyfta-disconnect-dialog')).not.toBeInTheDocument()
        })
        expect(mocks.disconnect.mutateAsync).not.toHaveBeenCalled()
    })

    it('disconnects when the dialog is confirmed', async () => {
        connected()
        render(<LyftaCard />)

        fireEvent.click(screen.getByTestId('lyfta-disconnect'))
        fireEvent.click(await screen.findByTestId('lyfta-disconnect-confirm'))
        await waitFor(() => {
            expect(mocks.disconnect.mutateAsync).toHaveBeenCalledTimes(1)
        })
    })

    it('keeps the dialog open and shows the error inside it when disconnecting fails', async () => {
        connected()
        mocks.disconnect.mutateAsync.mockRejectedValue(new Error('network'))
        render(<LyftaCard />)

        fireEvent.click(screen.getByTestId('lyfta-disconnect'))
        fireEvent.click(await screen.findByTestId('lyfta-disconnect-confirm'))

        expect(await screen.findByTestId('lyfta-disconnect-error')).toBeInTheDocument()
        expect(screen.getByTestId('lyfta-disconnect-dialog')).toBeInTheDocument()
        expect(screen.queryByTestId('lyfta-error')).not.toBeInTheDocument()
    })
})
