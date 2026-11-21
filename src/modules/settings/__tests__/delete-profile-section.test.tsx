import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { DeleteProfileSection } from '@/modules/settings/delete-profile-section'
import type { TrpcKeyed } from '@/lib/__mocks__/trpc-path'

const mocks = vi.hoisted(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
    replace: vi.fn(),
    refresh: vi.fn(),
}))

vi.mock('@/lib/trpc', () => import('@/lib/__mocks__/trpc'))
vi.mock('@tanstack/react-query', async (importOriginal) => {
    const { routeTrpc } = await import('@/lib/__mocks__/trpc-path')
    return {
        ...(await importOriginal<typeof import('@tanstack/react-query')>()),
        useMutation: (options: TrpcKeyed) =>
            routeTrpc(
                {
                    'athlete.deleteAccount': () => ({
                        mutateAsync: mocks.mutateAsync,
                        isPending: mocks.isPending,
                    }),
                },
                options
            ),
    }
})

vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}))

let queryClient: QueryClient

const render = (ui: ReactElement) =>
    rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)

const openDialog = async () => {
    fireEvent.click(screen.getByTestId('profile-delete'))
    await waitFor(() => {
        expect(screen.getByTestId('profile-delete-dialog')).toBeInTheDocument()
    })
}

describe('DeleteProfileSection', () => {
    beforeEach(() => {
        // jsdom has no matchMedia; the confirm dialog reads it through useIsMobile (desktop here).
        vi.stubGlobal('matchMedia', () => ({
            matches: false,
            addEventListener: () => {},
            removeEventListener: () => {},
        }))
        vi.clearAllMocks()
        mocks.isPending = false
        queryClient = new QueryClient()
    })

    it('shows the button and does not delete anything until confirmed', async () => {
        render(<DeleteProfileSection />)

        expect(screen.getByTestId('profile-delete')).toBeInTheDocument()
        expect(screen.queryByTestId('profile-delete-dialog')).not.toBeInTheDocument()

        await openDialog()

        expect(screen.getByTestId('profile-delete-description')).toHaveTextContent(
            'cannot be undone'
        )
        expect(mocks.mutateAsync).not.toHaveBeenCalled()
    })

    it('closes without deleting when the athlete keeps the profile', async () => {
        render(<DeleteProfileSection />)
        await openDialog()

        fireEvent.click(screen.getByTestId('profile-delete-cancel'))

        await waitFor(() => {
            expect(screen.queryByTestId('profile-delete-dialog')).not.toBeInTheDocument()
        })
        expect(mocks.mutateAsync).not.toHaveBeenCalled()
        expect(mocks.replace).not.toHaveBeenCalled()
    })

    it('deletes, clears the cache and goes to the login page', async () => {
        const clearSpy = vi.spyOn(queryClient, 'clear')
        mocks.mutateAsync.mockResolvedValue({ status: 200 })
        render(<DeleteProfileSection />)
        await openDialog()

        fireEvent.click(screen.getByTestId('profile-delete-confirm'))

        await waitFor(() => {
            expect(mocks.replace).toHaveBeenCalledWith('/login')
        })
        expect(mocks.mutateAsync).toHaveBeenCalledTimes(1)
        expect(mocks.refresh).toHaveBeenCalledTimes(1)
        expect(clearSpy.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.replace.mock.invocationCallOrder[0]
        )
    })

    it('keeps the dialog open with a fixed message when the delete fails', async () => {
        const clearSpy = vi.spyOn(queryClient, 'clear')
        mocks.mutateAsync.mockRejectedValue(new Error('ad8t4nrb'))
        render(<DeleteProfileSection />)
        await openDialog()

        fireEvent.click(screen.getByTestId('profile-delete-confirm'))

        await waitFor(() => {
            expect(screen.getByTestId('profile-delete-error')).toHaveTextContent(
                'Could not delete your profile. Nothing was removed, try again.'
            )
        })
        expect(screen.getByTestId('profile-delete-dialog')).toBeInTheDocument()
        expect(mocks.replace).not.toHaveBeenCalled()
        expect(clearSpy).not.toHaveBeenCalled()
    })

    it('disables the confirm button while the delete runs', async () => {
        mocks.isPending = true
        render(<DeleteProfileSection />)
        await openDialog()

        expect(screen.getByTestId('profile-delete-confirm')).toBeDisabled()
    })
})
