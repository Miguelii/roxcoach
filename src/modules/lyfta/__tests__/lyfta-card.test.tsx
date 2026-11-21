import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { LyftaCard } from '@/modules/lyfta/lyfta-card'
import type { TrpcKeyed } from '@/lib/__mocks__/trpc-path'

const mocks = vi.hoisted(() => ({
    statusQuery: {
        data: { connected: false, lastSyncedAt: '' },
        isPending: false,
        isError: false,
        refetch: vi.fn(),
    },
    invalidate: vi.fn(),
    invalidateCalendar: vi.fn(),
    invalidateStrength: vi.fn(),
    connect: { mutateAsync: vi.fn(), reset: vi.fn(), isPending: false },
    sync: { mutateAsync: vi.fn(), reset: vi.fn(), isPending: false },
    disconnect: { mutateAsync: vi.fn(), reset: vi.fn(), isPending: false },
}))

vi.mock('@/lib/trpc', () => import('@/lib/__mocks__/trpc'))
vi.mock('@tanstack/react-query', async (importOriginal) => {
    const { routeTrpc } = await import('@/lib/__mocks__/trpc-path')
    return {
        ...(await importOriginal<typeof import('@tanstack/react-query')>()),
        useQuery: (options: TrpcKeyed) =>
            routeTrpc({ 'lyfta.getConnectionStatus': () => mocks.statusQuery }, options),
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

describe('LyftaCard', () => {
    beforeEach(() => {
        // jsdom has no matchMedia; the confirm dialog reads it through useIsMobile (desktop here).
        vi.stubGlobal('matchMedia', () => ({
            matches: false,
            addEventListener: () => {},
            removeEventListener: () => {},
        }))
        vi.clearAllMocks()
        mocks.statusQuery.data = { connected: false, lastSyncedAt: '' }
        mocks.statusQuery.isPending = false
        mocks.statusQuery.isError = false
        mocks.connect.isPending = false
        mocks.sync.isPending = false
        mocks.disconnect.isPending = false
        mocks.connect.mutateAsync.mockResolvedValue({
            connected: true,
            lastSyncedAt: null,
        })
        mocks.sync.mutateAsync.mockResolvedValue({
            created: 0,
            updated: 0,
            hasMore: false,
            lastSyncedAt: '2026-11-20T08:30:00.000Z',
        })
        mocks.disconnect.mutateAsync.mockResolvedValue(undefined)
        mocks.invalidate.mockResolvedValue(undefined)
        mocks.invalidateCalendar.mockResolvedValue(undefined)
        mocks.invalidateStrength.mockResolvedValue(undefined)
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

    it('reports sync counts and rate-limit errors', async () => {
        mocks.statusQuery.data = { connected: true, lastSyncedAt: '' }
        mocks.sync.mutateAsync.mockResolvedValueOnce({
            created: 2,
            updated: 1,
            hasMore: false,
            lastSyncedAt: '2026-11-20T08:30:00.000Z',
        })
        render(<LyftaCard />)
        fireEvent.click(screen.getByTestId('lyfta-sync'))

        await waitFor(() => {
            expect(screen.getByTestId('lyfta-sync-success')).toHaveTextContent(
                '2 workouts added and 1 updated.'
            )
        })
        expect(mocks.invalidateCalendar).toHaveBeenCalledTimes(1)
        expect(mocks.invalidateStrength).toHaveBeenCalledTimes(1)

        mocks.sync.mutateAsync.mockRejectedValueOnce(new Error(ErrorCode.LYFTA_RATE_LIMIT))
        fireEvent.click(screen.getByTestId('lyfta-sync'))
        await waitFor(() => {
            expect(screen.getByTestId('lyfta-error')).toHaveTextContent(
                'Lyfta is rate limiting requests.'
            )
        })
    })

    it('asks to sync again when more workouts remain, and shows the running sync message', async () => {
        mocks.statusQuery.data = { connected: true, lastSyncedAt: '' }
        mocks.sync.mutateAsync.mockResolvedValueOnce({
            created: 3,
            updated: 0,
            hasMore: true,
            lastSyncedAt: null,
        })
        render(<LyftaCard />)
        fireEvent.click(screen.getByTestId('lyfta-sync'))

        await waitFor(() => {
            expect(screen.getByTestId('lyfta-sync-more')).toHaveTextContent(
                'More workouts to sync. Press Sync workouts again to continue.'
            )
        })
        expect(screen.queryByTestId('lyfta-sync-success')).toBeNull()

        mocks.sync.mutateAsync.mockRejectedValueOnce(new Error('A Lyfta sync is already running'))
        fireEvent.click(screen.getByTestId('lyfta-sync'))
        await waitFor(() => {
            expect(screen.getByTestId('lyfta-error')).toHaveTextContent(
                'A Lyfta sync is already running'
            )
        })
    })

    it('disables another sync while a request is pending', () => {
        mocks.statusQuery.data = { connected: true, lastSyncedAt: '' }
        mocks.sync.isPending = true
        render(<LyftaCard />)

        expect(screen.getByTestId('lyfta-sync')).toBeDisabled()
        fireEvent.click(screen.getByTestId('lyfta-sync'))
        expect(mocks.sync.mutateAsync).not.toHaveBeenCalled()
    })

    it('asks in a dialog before disconnecting, and Keep connected closes it without disconnecting', async () => {
        mocks.statusQuery.data = { connected: true, lastSyncedAt: '' }
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
        mocks.statusQuery.data = { connected: true, lastSyncedAt: '' }
        render(<LyftaCard />)

        fireEvent.click(screen.getByTestId('lyfta-disconnect'))
        fireEvent.click(await screen.findByTestId('lyfta-disconnect-confirm'))
        await waitFor(() => {
            expect(mocks.disconnect.mutateAsync).toHaveBeenCalledTimes(1)
        })
    })

    it('keeps the dialog open and shows the error inside it when disconnecting fails', async () => {
        mocks.statusQuery.data = { connected: true, lastSyncedAt: '' }
        mocks.disconnect.mutateAsync.mockRejectedValue(new Error('network'))
        render(<LyftaCard />)

        fireEvent.click(screen.getByTestId('lyfta-disconnect'))
        fireEvent.click(await screen.findByTestId('lyfta-disconnect-confirm'))

        expect(await screen.findByTestId('lyfta-disconnect-error')).toBeInTheDocument()
        expect(screen.getByTestId('lyfta-disconnect-dialog')).toBeInTheDocument()
        expect(screen.queryByTestId('lyfta-error')).not.toBeInTheDocument()
    })
})
