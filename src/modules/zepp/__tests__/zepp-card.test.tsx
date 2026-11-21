import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { ZeppCard } from '@/modules/zepp/zepp-card'
import type { TrpcKeyed } from '@/lib/__mocks__/trpc-path'

type Status = { connected: boolean; lastSyncedAt: string | null }

const mocks = vi.hoisted(() => {
    const data: Status = { connected: false, lastSyncedAt: null }
    return {
        statusQuery: { data, isPending: false, isError: false, refetch: vi.fn() },
        invalidateStatus: vi.fn(),
        invalidateCalendar: vi.fn(),
        invalidateRunProgress: vi.fn(),
        connect: { mutateAsync: vi.fn(), reset: vi.fn(), isPending: false },
        sync: { mutateAsync: vi.fn(), reset: vi.fn(), isPending: false },
        disconnect: { mutateAsync: vi.fn(), reset: vi.fn(), isPending: false },
    }
})

vi.mock('@/lib/trpc', () => import('@/lib/__mocks__/trpc'))
vi.mock('@tanstack/react-query', async (importOriginal) => {
    const { routeTrpc } = await import('@/lib/__mocks__/trpc-path')
    return {
        ...(await importOriginal<typeof import('@tanstack/react-query')>()),
        useQuery: (options: TrpcKeyed) =>
            routeTrpc({ 'zepp.getConnectionStatus': () => mocks.statusQuery }, options),
        useMutation: (options: TrpcKeyed) =>
            routeTrpc(
                {
                    'zepp.connect': () => mocks.connect,
                    'zepp.syncActivities': () => mocks.sync,
                    'zepp.disconnect': () => mocks.disconnect,
                },
                options
            ),
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

const fill = (testId: string, value: string) =>
    fireEvent.change(screen.getByTestId(testId), { target: { value } })

const connected = () => {
    mocks.statusQuery.data = { connected: true, lastSyncedAt: '2026-11-21T10:00:00.000Z' }
}

describe('ZeppCard', () => {
    beforeEach(() => {
        vi.stubGlobal('matchMedia', () => ({
            matches: false,
            addEventListener: () => {},
            removeEventListener: () => {},
        }))
        vi.clearAllMocks()
        mocks.statusQuery.data = { connected: false, lastSyncedAt: null }
        mocks.statusQuery.isPending = false
        mocks.statusQuery.isError = false
        mocks.connect.mutateAsync.mockResolvedValue({ connected: true, lastSyncedAt: null })
        mocks.sync.mutateAsync.mockResolvedValue({ imported: 2, skipped: 1, remaining: 3 })
        mocks.disconnect.mutateAsync.mockResolvedValue(null)
        mocks.invalidateStatus.mockResolvedValue(null)
        mocks.invalidateCalendar.mockResolvedValue(null)
        mocks.invalidateRunProgress.mockResolvedValue(null)
    })

    it('shows a loading skeleton and a retry on a status error', () => {
        mocks.statusQuery.isPending = true
        const { unmount } = render(<ZeppCard />)
        expect(screen.getByTestId('zepp-loading')).toBeInTheDocument()
        unmount()

        mocks.statusQuery.isPending = false
        mocks.statusQuery.isError = true
        render(<ZeppCard />)
        fireEvent.click(screen.getByTestId('zepp-status-retry'))
        expect(mocks.statusQuery.refetch).toHaveBeenCalledTimes(1)
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
            expect(screen.getByTestId('zepp-error')).toHaveTextContent(
                'Zepp did not accept this email or password.'
            )
        })
        expect(screen.getByTestId('zepp-password')).toHaveValue('')
        expect(screen.getByTestId('zepp-email')).toHaveValue('athlete@example.com')
    })

    it('syncs, shows what was imported and refreshes the calendar and the run dashboard', async () => {
        connected()
        render(<ZeppCard />)

        expect(screen.getByTestId('zepp-connected')).toBeInTheDocument()
        expect(screen.queryByTestId('zepp-form')).toBeNull()
        fireEvent.click(screen.getByTestId('zepp-sync'))

        await waitFor(() => {
            expect(screen.getByTestId('zepp-sync-result')).toHaveTextContent(
                'Imported 2 runs. 1 already in Roxcoach. More runs to sync. Press Sync again to continue.'
            )
        })
        expect(mocks.invalidateStatus).toHaveBeenCalled()
        expect(mocks.invalidateCalendar).toHaveBeenCalled()
        expect(mocks.invalidateRunProgress).toHaveBeenCalled()
    })

    it('shows an expired session as an actionable error and offers to sign in again', async () => {
        connected()
        mocks.sync.mutateAsync.mockRejectedValue(new Error(ErrorCode.ZEPP_SESSION_EXPIRED))
        render(<ZeppCard />)
        fireEvent.click(screen.getByTestId('zepp-sync'))

        await waitFor(() => {
            expect(screen.getByTestId('zepp-error')).toHaveTextContent(
                'Your Zepp session expired. Sign in again.'
            )
        })
        fireEvent.click(screen.getByTestId('zepp-reconnect'))
        expect(screen.getByTestId('zepp-form')).toBeInTheDocument()
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
