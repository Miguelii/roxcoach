import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { LyftaTab } from '@/modules/settings/lyfta-tab'

const mocks = vi.hoisted(() => ({
    statusQuery: {
        data: { connected: false, lastSyncedAt: '' },
        isPending: false,
        isError: false,
        refetch: vi.fn(),
    },
    invalidate: vi.fn(),
    invalidateCalendar: vi.fn(),
    connect: { mutateAsync: vi.fn(), reset: vi.fn(), isPending: false },
    sync: { mutateAsync: vi.fn(), reset: vi.fn(), isPending: false },
    disconnect: { mutateAsync: vi.fn(), reset: vi.fn(), isPending: false },
}))

vi.mock('@/lib/trpc', () => ({
    trpcClient: {
        lyfta: {
            getConnectionStatus: { useQuery: () => mocks.statusQuery },
            connect: { useMutation: () => mocks.connect },
            syncWorkouts: { useMutation: () => mocks.sync },
            disconnect: { useMutation: () => mocks.disconnect },
        },
        useUtils: () => ({
            lyfta: { getConnectionStatus: { invalidate: mocks.invalidate } },
            training: { getCalendar: { invalidate: mocks.invalidateCalendar } },
        }),
    },
}))

describe('LyftaTab', () => {
    beforeEach(() => {
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
            lastSyncedAt: '2026-11-20T08:30:00.000Z',
        })
        mocks.disconnect.mutateAsync.mockResolvedValue(undefined)
        mocks.invalidate.mockResolvedValue(undefined)
        mocks.invalidateCalendar.mockResolvedValue(undefined)
    })

    it('shows an empty password field and validates before connecting', async () => {
        render(<LyftaTab />)

        expect(screen.getByTestId('lyfta-api-key')).toHaveAttribute('type', 'password')
        expect(screen.getByTestId('lyfta-api-key')).toHaveValue('')
        fireEvent.submit(screen.getByTestId('lyfta-key-form'))

        await waitFor(() => {
            expect(screen.getByTestId('lyfta-api-key-error')).toBeInTheDocument()
        })
        expect(mocks.connect.mutateAsync).not.toHaveBeenCalled()
    })

    it('saves the key, clears the input and refreshes the connection status', async () => {
        render(<LyftaTab />)
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
        render(<LyftaTab />)
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
            lastSyncedAt: '2026-11-20T08:30:00.000Z',
        })
        render(<LyftaTab />)
        fireEvent.click(screen.getByTestId('lyfta-sync'))

        await waitFor(() => {
            expect(screen.getByTestId('lyfta-sync-success')).toHaveTextContent(
                '2 workouts added and 1 updated.'
            )
        })
        expect(mocks.invalidateCalendar).toHaveBeenCalledTimes(1)

        mocks.sync.mutateAsync.mockRejectedValueOnce(new Error(ErrorCode.LYFTA_RATE_LIMIT))
        fireEvent.click(screen.getByTestId('lyfta-sync'))
        await waitFor(() => {
            expect(screen.getByTestId('lyfta-error')).toHaveTextContent(
                'Lyfta is rate limiting requests.'
            )
        })
    })

    it('disables another sync while a request is pending', () => {
        mocks.statusQuery.data = { connected: true, lastSyncedAt: '' }
        mocks.sync.isPending = true
        render(<LyftaTab />)

        expect(screen.getByTestId('lyfta-sync')).toBeDisabled()
        fireEvent.click(screen.getByTestId('lyfta-sync'))
        expect(mocks.sync.mutateAsync).not.toHaveBeenCalled()
    })

    it('requires inline confirmation before disconnecting', async () => {
        mocks.statusQuery.data = { connected: true, lastSyncedAt: '' }
        render(<LyftaTab />)

        fireEvent.click(screen.getByTestId('lyfta-disconnect'))
        expect(screen.getByTestId('lyfta-disconnect-confirm')).toBeInTheDocument()
        fireEvent.click(screen.getByTestId('lyfta-disconnect-cancel'))
        expect(screen.queryByTestId('lyfta-disconnect-confirm')).not.toBeInTheDocument()

        fireEvent.click(screen.getByTestId('lyfta-disconnect'))
        fireEvent.click(screen.getByTestId('lyfta-disconnect-confirm'))
        await waitFor(() => {
            expect(mocks.disconnect.mutateAsync).toHaveBeenCalledTimes(1)
        })
    })
})
