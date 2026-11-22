import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { LoginCard } from '@/modules/auth/login-card'
import type { TrpcKeyed } from '@/lib/__mocks__/trpc-path'

const mocks = vi.hoisted(() => ({
    mutateAsync: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
}))

vi.mock('@/lib/trpc', () => import('@/lib/__mocks__/trpc'))
vi.mock('@tanstack/react-query', async (importOriginal) => {
    const { routeTrpc } = await import('@/lib/__mocks__/trpc-path')
    return {
        ...(await importOriginal<typeof import('@tanstack/react-query')>()),
        useMutation: (options: TrpcKeyed) =>
            routeTrpc({ 'auth.login': () => ({ mutateAsync: mocks.mutateAsync }) }, options),
    }
})

vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}))

let queryClient: QueryClient

const render = (ui: ReactElement) =>
    rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)

const GENERIC_ERROR = 'Invalid email or password'

const fill = (email: string, password: string) => {
    fireEvent.change(screen.getByTestId('login-email'), { target: { value: email } })
    fireEvent.change(screen.getByTestId('login-password'), { target: { value: password } })
}

const submit = () => fireEvent.click(screen.getByTestId('login-submit'))

describe('LoginCard', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        queryClient = new QueryClient()
    })

    it('renders the card with credential attributes', () => {
        render(<LoginCard />)
        expect(screen.getByTestId('login-card')).toBeInTheDocument()
        expect(screen.getByTestId('login-email')).toHaveAttribute('autocomplete', 'username')
        expect(screen.getByTestId('login-password')).toHaveAttribute('type', 'password')
        expect(screen.getByTestId('login-password')).toHaveAttribute(
            'autocomplete',
            'current-password'
        )
        expect(screen.queryByTestId('login-error')).not.toBeInTheDocument()
    })

    it('shows and hides the password with the eye button', () => {
        render(<LoginCard />)

        fireEvent.click(screen.getByTestId('login-password-toggle'))
        expect(screen.getByTestId('login-password')).toHaveAttribute('type', 'text')

        fireEvent.click(screen.getByTestId('login-password-toggle'))
        expect(screen.getByTestId('login-password')).toHaveAttribute('type', 'password')
    })

    it('shows the sign-up link only when sign-up is open', () => {
        const { rerender } = render(<LoginCard />)
        expect(screen.queryByTestId('signup-link')).not.toBeInTheDocument()

        rerender(
            <QueryClientProvider client={queryClient}>
                <LoginCard signupOpen />
            </QueryClientProvider>
        )
        expect(screen.getByTestId('signup-link')).toHaveAttribute('href', '/signup')
    })

    it('shows field errors and skips the mutation for empty fields', async () => {
        render(<LoginCard />)
        submit()
        await waitFor(() => {
            expect(screen.getByTestId('login-email-error')).toBeInTheDocument()
        })
        expect(screen.getByTestId('login-password-error')).toBeInTheDocument()
        expect(mocks.mutateAsync).not.toHaveBeenCalled()
    })

    it.each([
        ['an auth failure', new Error('hash_auth_login_sign_in_err')],
        ['a server failure', new Error('hash_internal')],
        ['a non-error rejection', 'boom'],
    ])('shows the same fixed message for %s', async (_label, failure) => {
        const clearSpy = vi.spyOn(queryClient, 'clear')
        mocks.mutateAsync.mockRejectedValue(failure)
        render(<LoginCard />)
        fill('coach@example.com', 'secret')
        submit()
        await waitFor(() => {
            expect(screen.getByTestId('login-error')).toHaveTextContent(GENERIC_ERROR)
        })
        expect(screen.getByTestId('login-error').textContent).toBe(GENERIC_ERROR)
        expect(mocks.replace).not.toHaveBeenCalled()
        expect(mocks.refresh).not.toHaveBeenCalled()
        expect(clearSpy).not.toHaveBeenCalled()
    })

    it('sends the credentials, redirects to a safe returnTo and refreshes', async () => {
        mocks.mutateAsync.mockResolvedValue({ status: 200 })
        render(<LoginCard returnTo="/plan" />)
        fill('coach@example.com', 'secret')
        submit()
        await waitFor(() => {
            expect(mocks.replace).toHaveBeenCalledWith('/plan')
        })
        expect(mocks.mutateAsync).toHaveBeenCalledWith({
            email: 'coach@example.com',
            password: 'secret',
        })
        expect(mocks.refresh).toHaveBeenCalledTimes(1)
        expect(mocks.replace.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.refresh.mock.invocationCallOrder[0]
        )
    })

    it('clears the query cache before navigating on a successful login', async () => {
        const clearSpy = vi.spyOn(queryClient, 'clear')
        mocks.mutateAsync.mockResolvedValue({ status: 200 })
        render(<LoginCard />)
        fill('coach@example.com', 'secret')
        submit()
        await waitFor(() => {
            expect(mocks.replace).toHaveBeenCalled()
        })
        expect(clearSpy).toHaveBeenCalledTimes(1)
        expect(clearSpy.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.replace.mock.invocationCallOrder[0]
        )
    })

    it('falls back to the default path for an unsafe returnTo', async () => {
        mocks.mutateAsync.mockResolvedValue({ status: 200 })
        render(<LoginCard returnTo="//evil.com" />)
        fill('coach@example.com', 'secret')
        submit()
        await waitFor(() => {
            expect(mocks.replace).toHaveBeenCalledWith('/dashboard')
        })
        expect(mocks.refresh).toHaveBeenCalledTimes(1)
    })

    it('disables the submit button while the login is pending', async () => {
        mocks.mutateAsync.mockReturnValue(new Promise(() => {}))
        render(<LoginCard />)
        fill('coach@example.com', 'secret')
        expect(screen.getByTestId('login-submit')).toBeEnabled()
        submit()
        await waitFor(() => {
            expect(screen.getByTestId('login-submit')).toBeDisabled()
        })
    })
})
