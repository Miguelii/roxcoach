import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StravaCard } from '@/modules/settings/strava-card'

const mocks = vi.hoisted(() => ({
    getConnectUrl: vi.fn(),
    toastError: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))

vi.mock('@/lib/trpc', () => ({
    trpcClient: {
        useUtils: () => ({ strava: { getStatus: { invalidate: vi.fn() } } }),
        strava: {
            getStatus: {
                useQuery: () => ({
                    data: {
                        connected: false,
                        connectedAt: null,
                        lastSyncedAt: null,
                        activityCount: 0,
                    },
                    isError: false,
                    refetch: vi.fn(),
                }),
            },
            getConnectUrl: { useMutation: () => ({ mutateAsync: mocks.getConnectUrl }) },
            syncNow: { useMutation: () => ({ mutateAsync: vi.fn() }) },
            disconnect: { useMutation: () => ({ mutateAsync: vi.fn() }) },
        },
    },
}))

describe('StravaCard', () => {
    const assign = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
        vi.stubGlobal('location', { assign })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('assigns window.location to the url returned by getConnectUrl', async () => {
        mocks.getConnectUrl.mockResolvedValue({ url: 'https://www.strava.com/oauth/authorize?x=1' })
        render(<StravaCard />)

        fireEvent.click(screen.getByTestId('strava-connect'))

        await waitFor(() =>
            expect(assign).toHaveBeenCalledWith('https://www.strava.com/oauth/authorize?x=1')
        )
    })

    it('refuses a connect url on another origin: toast and no navigation', async () => {
        mocks.getConnectUrl.mockResolvedValue({ url: 'https://evil.example/phish' })
        render(<StravaCard />)

        fireEvent.click(screen.getByTestId('strava-connect'))

        await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1))
        expect(assign).not.toHaveBeenCalled()
    })

    it('shows a toast when getConnectUrl fails and does not navigate', async () => {
        mocks.getConnectUrl.mockRejectedValue(new Error('nope'))
        render(<StravaCard />)

        fireEvent.click(screen.getByTestId('strava-connect'))

        await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1))
        expect(assign).not.toHaveBeenCalled()
    })
})
