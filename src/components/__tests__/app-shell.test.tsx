import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from '@/components/app-shell'
import { CoachPanelProvider, useCoachPanel } from '@/modules/coach/coach-panel-context'
import type { TrpcKeyed } from '@/lib/__mocks__/trpc-path'

const mocks = vi.hoisted(() => ({
    mutateAsync: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    toastError: vi.fn(),
    setDashboardMode: vi.fn(),
}))

vi.mock('@/lib/trpc', () => import('@/lib/__mocks__/trpc'))
vi.mock('@tanstack/react-query', async (importOriginal) => {
    const { routeTrpc } = await import('@/lib/__mocks__/trpc-path')
    return {
        ...(await importOriginal<typeof import('@tanstack/react-query')>()),
        useQuery: (options: TrpcKeyed) =>
            routeTrpc(
                { 'athlete.getProfile': () => ({ data: { dashboardMode: 'run' } }) },
                options
            ),
        useMutation: (options: TrpcKeyed) =>
            routeTrpc(
                {
                    'athlete.setDashboardMode': () => ({ mutate: mocks.setDashboardMode }),
                    'auth.logout': () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
                },
                options
            ),
    }
})

vi.mock('next/navigation', () => ({
    usePathname: () => '/dashboard',
    useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}))

vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))

const clickLogout = async (queryClient: QueryClient) => {
    render(
        <QueryClientProvider client={queryClient}>
            <AppShell>content</AppShell>
        </QueryClientProvider>
    )
    fireEvent.click(screen.getByTestId('logout-button'))
}

describe('AppShell logout', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('calls the logout mutation, then replaces to /login and refreshes', async () => {
        mocks.mutateAsync.mockResolvedValue({ status: 200 })
        const queryClient = new QueryClient()
        queryClient.setQueryData(['private-data'], 'sensitive')

        await clickLogout(queryClient)

        await waitFor(() => {
            expect(mocks.refresh).toHaveBeenCalledTimes(1)
        })
        expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
        expect(mocks.mutateAsync).toHaveBeenCalledTimes(1)
        expect(mocks.replace).toHaveBeenCalledWith('/login')
        expect(mocks.replace.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.refresh.mock.invocationCallOrder[0] ?? 0
        )
        expect(mocks.toastError).not.toHaveBeenCalled()
    })

    it('shows a toast and does not navigate when the logout fails', async () => {
        mocks.mutateAsync.mockRejectedValue(new Error('hash_auth_logout_sign_out'))
        const queryClient = new QueryClient()
        queryClient.setQueryData(['private-data'], 'sensitive')

        await clickLogout(queryClient)

        await waitFor(() => {
            expect(mocks.toastError).toHaveBeenCalledWith('Could not log out. Please try again.')
        })
        expect(mocks.replace).not.toHaveBeenCalled()
        expect(mocks.refresh).not.toHaveBeenCalled()
        expect(queryClient.getQueryData(['private-data'])).toBe('sensitive')
        queryClient.clear()
    })
})

describe('AppShell navigation', () => {
    it('lists Dashboard, Calendar and Races in the sidebar and mobile navigation', () => {
        render(
            <QueryClientProvider client={new QueryClient()}>
                <AppShell>content</AppShell>
            </QueryClientProvider>
        )
        const desktopNav = screen.getByTestId('nav-desktop')
        expect(desktopNav).toHaveTextContent('Dashboard')
        expect(desktopNav).toHaveTextContent('Calendar')
        expect(desktopNav).toHaveTextContent('Races')
        expect(desktopNav).toHaveTextContent('Settings')

        const mobileNav = screen.getByTestId('nav-mobile')
        expect(mobileNav).toHaveTextContent('Dashboard')
        expect(mobileNav).toHaveTextContent('Calendar')
        expect(mobileNav).toHaveTextContent('Races')
        expect(mobileNav).toHaveTextContent('Settings')
    })

    it('toggles the desktop coach preference and stores it in a cookie', () => {
        const Probe = () => (
            <span data-testid="coach-enabled">{String(useCoachPanel().enabled)}</span>
        )
        render(
            <QueryClientProvider client={new QueryClient()}>
                <CoachPanelProvider>
                    <AppShell>content</AppShell>
                    <Probe />
                </CoachPanelProvider>
            </QueryClientProvider>
        )
        expect(screen.getByTestId('coach-enabled')).toHaveTextContent('true')
        fireEvent.click(screen.getByTestId('coach-toggle'))
        expect(screen.getByTestId('coach-enabled')).toHaveTextContent('false')
        expect(document.cookie).toContain('coach_enabled=0')
        fireEvent.click(screen.getByTestId('coach-toggle'))
        expect(screen.getByTestId('coach-enabled')).toHaveTextContent('true')
        expect(document.cookie).toContain('coach_enabled=1')
    })

    it('has a direct Log out button at the bottom of the sidebar, with no account dropdown', () => {
        render(
            <QueryClientProvider client={new QueryClient()}>
                <AppShell>content</AppShell>
            </QueryClientProvider>
        )

        expect(screen.getByTestId('logout-button')).toHaveTextContent('Log out')
        expect(screen.queryByTestId('account-menu-trigger')).toBeNull()
    })

    it('has a Log out icon button in the phone top bar, with no account dropdown', () => {
        render(
            <QueryClientProvider client={new QueryClient()}>
                <AppShell>content</AppShell>
            </QueryClientProvider>
        )

        expect(screen.getByTestId('logout-button-mobile')).toHaveAccessibleName('Log out')
        expect(screen.queryByTestId('account-menu-trigger-mobile')).toBeNull()
    })

    it('logs out from the phone top bar button', async () => {
        mocks.mutateAsync.mockResolvedValue({ status: 200 })
        render(
            <QueryClientProvider client={new QueryClient()}>
                <AppShell>content</AppShell>
            </QueryClientProvider>
        )

        fireEvent.click(screen.getByTestId('logout-button-mobile'))

        await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login'))
    })

    it('has the dashboard mode switch at the bottom of the sidebar and saves a change', () => {
        render(
            <QueryClientProvider client={new QueryClient()}>
                <AppShell>content</AppShell>
            </QueryClientProvider>
        )

        expect(screen.getByTestId('nav-mode-run')).toHaveAttribute('aria-selected', 'true')
        fireEvent.click(screen.getByTestId('nav-mode-strength'))
        expect(mocks.setDashboardMode).toHaveBeenCalledWith({ mode: 'strength' })
    })

    it('opens the coach panel from the mobile nav button', () => {
        const Probe = () => <span data-testid="coach-state">{String(useCoachPanel().open)}</span>
        render(
            <QueryClientProvider client={new QueryClient()}>
                <CoachPanelProvider>
                    <AppShell>content</AppShell>
                    <Probe />
                </CoachPanelProvider>
            </QueryClientProvider>
        )
        expect(screen.getByTestId('coach-state')).toHaveTextContent('false')
        fireEvent.click(screen.getByTestId('nav-coach'))
        expect(screen.getByTestId('coach-state')).toHaveTextContent('true')
    })
})
