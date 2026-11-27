import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SYNC_START_MESSAGE, type SyncStatus } from '@/_bff/core/constants/sync.constants'
import type { ZeppSyncResult } from '@/_bff/core/constants/zepp.constants'
import { ZEPP_SYNC_IN_PROGRESS_MESSAGE } from '@/_bff/core/constants/zepp.constants'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { ZeppCard } from '@/modules/zepp/zepp-card'
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

type StatusQuery = {
    data: Status | undefined
    isPending: boolean
    isError: boolean
    refetch: () => void
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
        lastSyncedAt: null,
        sync: { status: 'idle', startedAt: null, finishedAt: null, result: null, errorCode: null },
    }
    const statusOptions: QueryOptions[] = []
    const statusQuery: StatusQuery = { data, isPending: false, isError: false, refetch: vi.fn() }
    return {
        statusQuery,
        statusOptions,
        invalidateStatus: vi.fn(),
        invalidateCalendar: vi.fn(),
        invalidateRunProgress: vi.fn(),
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
                    'zepp.getConnectionStatus': () => {
                        mocks.statusOptions.push(options)
                        return mocks.statusQuery
                    },
                    'zepp.getActivityCount': () => ({ data: { count: 38 }, isError: false }),
                },
                options
            ),
        useMutation: (options: TrpcKeyed) =>
            routeTrpc(
                {
                    'zepp.connect': () => mocks.connect,
                    'zepp.syncActivities': () => mocks.sync,
                    'zepp.disconnect': () => mocks.disconnect,
                    'zepp.clearActivities': () => mocks.disconnect,
                },
                options
            ),
        useQueryClient: () => ({
            invalidateQueries: (filter: TrpcKeyed) =>
                routeTrpc(
                    {
                        'zepp.getConnectionStatus': mocks.invalidateStatus,
                        'zepp.getActivityCount': mocks.invalidateStatus,
                        'training.getCalendar': mocks.invalidateCalendar,
                        'training.getRunProgress': mocks.invalidateRunProgress,
                    },
                    filter
                ),
        }),
    }
})

const fill = (testId: string, value: string) =>
    fireEvent.change(screen.getByTestId(testId), { target: { value } })

const connected = (sync: Partial<Sync> = {}) => {
    mocks.statusQuery.data = {
        connected: true,
        lastSyncedAt: '2026-11-21T10:00:00.000Z',
        sync: { ...IDLE, ...sync },
    }
}

describe('ZeppCard', () => {
    beforeEach(() => {
        vi.stubGlobal('matchMedia', () => ({
            matches: false,
            addEventListener: () => {},
            removeEventListener: () => {},
        }))
        vi.clearAllMocks()
        mocks.statusOptions.length = 0
        mocks.statusQuery.data = { connected: false, lastSyncedAt: null, sync: IDLE }
        mocks.statusQuery.isPending = false
        mocks.statusQuery.isError = false
        mocks.connect.mutateAsync.mockResolvedValue({ connected: true, lastSyncedAt: null })
        mocks.sync.mutateAsync.mockResolvedValue({ startedAt: 't1' })
        mocks.disconnect.mutateAsync.mockResolvedValue(null)
        mocks.invalidateStatus.mockResolvedValue(null)
        mocks.invalidateCalendar.mockResolvedValue(null)
        mocks.invalidateRunProgress.mockResolvedValue(null)
    })

    it('shows a loading skeleton, and nothing on a status error', () => {
        mocks.statusQuery.isPending = true
        const { unmount } = render(<ZeppCard />)
        expect(screen.getByTestId('zepp-loading')).toBeInTheDocument()
        unmount()

        mocks.statusQuery.isPending = false
        mocks.statusQuery.isError = true
        mocks.statusQuery.data = undefined
        const { container } = render(<ZeppCard />)
        expect(container).toBeEmptyDOMElement()
        expect(screen.queryByTestId('zepp-status-retry')).toBeNull()
    })

    it('shows the password while the eye is pressed', () => {
        render(<ZeppCard />)

        fireEvent.click(screen.getByTestId('zepp-password-toggle'))
        expect(screen.getByTestId('zepp-password')).toHaveAttribute('type', 'text')
    })

    it('asks for the email and an empty password field and validates before connecting', async () => {
        render(<ZeppCard />)

        expect(screen.getByTestId('zepp-password')).toHaveAttribute('type', 'password')
        expect(screen.getByTestId('zepp-password')).toHaveValue('')
        fireEvent.submit(screen.getByTestId('zepp-form'))

        await waitFor(() => {
            expect(screen.getByTestId('zepp-email-error')).toBeInTheDocument()
            expect(screen.getByTestId('zepp-password-error')).toBeInTheDocument()
        })
        expect(mocks.connect.mutateAsync).not.toHaveBeenCalled()
    })

    it('does not connect with an invalid email', async () => {
        render(<ZeppCard />)
        fill('zepp-email', 'not-an-email')
        fill('zepp-password', 'secret')
        fireEvent.submit(screen.getByTestId('zepp-form'))

        await waitFor(() => {
            expect(screen.getByTestId('zepp-email-error')).toBeInTheDocument()
        })
        expect(mocks.connect.mutateAsync).not.toHaveBeenCalled()
    })

    it('connects, clears the password and refreshes the status', async () => {
        render(<ZeppCard />)
        fill('zepp-email', 'athlete@example.com')
        fill('zepp-password', 'secret')
        fireEvent.submit(screen.getByTestId('zepp-form'))

        await waitFor(() => {
            expect(mocks.connect.mutateAsync).toHaveBeenCalledWith({
                email: 'athlete@example.com',
                password: 'secret',
            })
            expect(mocks.invalidateStatus).toHaveBeenCalledTimes(1)
        })
        expect(screen.getByTestId('zepp-password')).toHaveValue('')
    })

    it('shows why the login failed and clears only the password', async () => {
        mocks.connect.mutateAsync.mockRejectedValue(new Error(ErrorCode.ZEPP_LOGIN_REJECTED))
        render(<ZeppCard />)
        fill('zepp-email', 'athlete@example.com')
        fill('zepp-password', 'wrong')
        fireEvent.submit(screen.getByTestId('zepp-form'))

        await waitFor(() => {
            expect(mocks.error).toHaveBeenCalledWith('Zepp did not accept this email or password.')
        })
        expect(screen.queryByTestId('zepp-error')).toBeNull()
        expect(screen.getByTestId('zepp-password')).toHaveValue('')
        expect(screen.getByTestId('zepp-email')).toHaveValue('athlete@example.com')
    })

    it('starts a sync and refreshes the status without a result yet', async () => {
        connected()
        render(<ZeppCard />)

        expect(screen.getByTestId('zepp-connected')).toBeInTheDocument()
        expect(screen.queryByTestId('zepp-form')).toBeNull()
        fireEvent.click(screen.getByTestId('zepp-sync'))

        await waitFor(() => {
            expect(mocks.sync.mutateAsync).toHaveBeenCalledTimes(1)
            expect(mocks.invalidateStatus).toHaveBeenCalled()
        })
        expect(screen.queryByTestId('zepp-sync-result')).toBeNull()
        expect(screen.queryByTestId('zepp-error')).toBeNull()
    })

    it('toasts that the sync started and that a running one is already in progress', async () => {
        connected()
        render(<ZeppCard />)

        fireEvent.click(screen.getByTestId('zepp-sync'))
        await waitFor(() => {
            expect(mocks.info).toHaveBeenCalledWith(SYNC_START_MESSAGE)
        })

        mocks.sync.mutateAsync.mockRejectedValueOnce(new Error(ZEPP_SYNC_IN_PROGRESS_MESSAGE))
        fireEvent.click(screen.getByTestId('zepp-sync'))
        await waitFor(() => {
            expect(mocks.info).toHaveBeenCalledWith(ZEPP_SYNC_IN_PROGRESS_MESSAGE)
        })
        expect(mocks.error).not.toHaveBeenCalled()
    })

    it('polls the status only while a sync is running', () => {
        connected()
        render(<ZeppCard />)
        const options = mocks.statusOptions.at(-1)
        const running: Status = {
            connected: true,
            lastSyncedAt: null,
            sync: { ...IDLE, status: 'running', startedAt: 't1' },
        }

        expect(options?.refetchInterval?.({ state: { data: running } })).toBe(5000)
        expect(options?.refetchInterval?.({ state: { data: mocks.statusQuery.data } })).toBe(false)
    })

    it('shows what was imported when the sync it saw running ends and refreshes the training views', async () => {
        connected({ status: 'running', startedAt: 't1' })
        const { rerender } = render(<ZeppCard />)

        connected({
            status: 'succeeded',
            startedAt: 't1',
            result: { imported: 2, skipped: 1, updated: 0, remaining: 3 },
        })
        rerender(<ZeppCard />)

        expect(screen.getByTestId('zepp-sync-result')).toHaveTextContent(
            'Imported 2 runs. 1 already in Roxcoach. More runs to sync. Press Sync again to continue.'
        )
        await waitFor(() => {
            expect(mocks.invalidateCalendar).toHaveBeenCalledTimes(1)
            expect(mocks.invalidateRunProgress).toHaveBeenCalledTimes(1)
        })
    })

    it('shows the spinner and blocks another sync while one runs', () => {
        connected({ status: 'running', startedAt: 't1' })
        render(<ZeppCard />)

        expect(screen.getByTestId('zepp-sync')).toBeDisabled()
        expect(screen.getByTestId('zepp-sync-spinner')).toBeInTheDocument()
    })

    it('toasts the last failed sync and offers to sign in again', () => {
        connected({ status: 'failed', startedAt: 't1', errorCode: ErrorCode.ZEPP_SESSION_EXPIRED })
        render(<ZeppCard />)

        expect(mocks.error).toHaveBeenCalledWith('Your Zepp session expired. Sign in again.', {
            id: 'zepp-sync-error',
        })
        expect(screen.queryByTestId('zepp-error')).toBeNull()
        fireEvent.click(screen.getByTestId('zepp-reconnect'))
        expect(screen.getByTestId('zepp-form')).toBeInTheDocument()
    })

    it('shows why a sync could not start', async () => {
        connected()
        mocks.sync.mutateAsync.mockRejectedValue(new Error(ErrorCode.ZEPP_SYNC_ENQUEUE))
        render(<ZeppCard />)
        fireEvent.click(screen.getByTestId('zepp-sync'))

        await waitFor(() => {
            expect(mocks.error).toHaveBeenCalledWith('Could not start the Zepp sync. Try again.', {
                id: 'zepp-sync-error',
            })
        })
        expect(screen.queryByTestId('zepp-error')).toBeNull()
    })

    it('asks before disconnecting and only disconnects after confirming', async () => {
        connected()
        render(<ZeppCard />)
        fireEvent.click(screen.getByTestId('zepp-disconnect'))

        expect(await screen.findByTestId('zepp-disconnect-dialog')).toBeInTheDocument()
        expect(mocks.disconnect.mutateAsync).not.toHaveBeenCalled()
        fireEvent.click(screen.getByTestId('zepp-disconnect-confirm'))

        await waitFor(() => {
            expect(mocks.disconnect.mutateAsync).toHaveBeenCalledTimes(1)
        })
    })
})
