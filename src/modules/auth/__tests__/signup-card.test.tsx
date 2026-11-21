import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { SignupCard } from '@/modules/auth/signup-card'
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
            routeTrpc({ 'auth.signUp': () => ({ mutateAsync: mocks.mutateAsync }) }, options),
    }
})

vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}))

let queryClient: QueryClient

const render = (ui: ReactElement) =>
    rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)

const GENERIC_ERROR = 'Could not create your account. Check your details and access code.'

const fill = (email: string, password: string, accessCode: string) => {
    fireEvent.change(screen.getByTestId('signup-name'), { target: { value: 'Ana Silva' } })
    fireEvent.change(screen.getByTestId('signup-email'), { target: { value: email } })
    fireEvent.change(screen.getByTestId('signup-password'), { target: { value: password } })
    fireEvent.change(screen.getByTestId('signup-access-code'), { target: { value: accessCode } })
}

const submit = () => fireEvent.click(screen.getByTestId('signup-submit'))

describe('SignupCard', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        queryClient = new QueryClient()
    })

    it('renders the three fields with the right autocomplete and a link to sign in', () => {
        render(<SignupCard />)

        expect(screen.getByTestId('signup-card')).toBeInTheDocument()
        expect(screen.getByTestId('signup-password')).toHaveAttribute(
            'autocomplete',
            'new-password'
        )
        expect(screen.getByTestId('signup-access-code')).toHaveAttribute('autocomplete', 'off')
        // The access code is always visible; the password is hidden until the eye is toggled.
        expect(screen.getByTestId('signup-access-code')).not.toHaveAttribute('type', 'password')
        expect(screen.getByTestId('signup-password')).toHaveAttribute('type', 'password')
        expect(screen.getByTestId('signup-login-link')).toHaveAttribute('href', '/login')
        expect(screen.queryByTestId('signup-error')).not.toBeInTheDocument()
    })

    it('shows and hides the password with the eye button', () => {
        render(<SignupCard />)

        fireEvent.click(screen.getByTestId('signup-password-toggle'))
        expect(screen.getByTestId('signup-password')).toHaveAttribute('type', 'text')

        fireEvent.click(screen.getByTestId('signup-password-toggle'))
        expect(screen.getByTestId('signup-password')).toHaveAttribute('type', 'password')
    })

    it('shows field errors and skips the mutation for empty fields', async () => {
        render(<SignupCard />)
        submit()

        await waitFor(() => {
            expect(screen.getByTestId('signup-name-error')).toBeInTheDocument()
        })
        expect(screen.getByTestId('signup-email-error')).toBeInTheDocument()
        expect(screen.getByTestId('signup-password-error')).toBeInTheDocument()
        expect(screen.getByTestId('signup-access-code-error')).toBeInTheDocument()
        expect(mocks.mutateAsync).not.toHaveBeenCalled()
    })

    it('rejects a password shorter than 8 characters', async () => {
        render(<SignupCard />)
        fill('ana@example.com', '1234567', 'some-code')
        submit()

        await waitFor(() => {
            expect(screen.getByTestId('signup-password-error')).toBeInTheDocument()
        })
        expect(mocks.mutateAsync).not.toHaveBeenCalled()
    })

    it.each([
        ['a server failure', new Error('sg0r4aow')],
        ['a non-error rejection', 'boom'],
    ])('shows the same fixed message for %s and keeps the values', async (_label, failure) => {
        const clearSpy = vi.spyOn(queryClient, 'clear')
        mocks.mutateAsync.mockRejectedValue(failure)
        render(<SignupCard />)
        fill('ana@example.com', 'secret-password', 'some-code')
        submit()

        await waitFor(() => {
            expect(screen.getByTestId('signup-error')).toHaveTextContent(GENERIC_ERROR)
        })
        expect(screen.getByTestId('signup-error').textContent).toBe(GENERIC_ERROR)
        expect(screen.getByTestId('signup-email')).toHaveValue('ana@example.com')
        expect(mocks.replace).not.toHaveBeenCalled()
        expect(clearSpy).not.toHaveBeenCalled()
    })

    it('sends the values, clears the cache, then redirects to the dashboard and refreshes', async () => {
        const clearSpy = vi.spyOn(queryClient, 'clear')
        mocks.mutateAsync.mockResolvedValue({ status: 200 })
        render(<SignupCard />)
        fill('ana@example.com', 'secret-password', 'some-code')
        submit()

        await waitFor(() => {
            expect(mocks.replace).toHaveBeenCalledWith('/dashboard')
        })
        expect(mocks.mutateAsync).toHaveBeenCalledWith({
            displayName: 'Ana Silva',
            email: 'ana@example.com',
            password: 'secret-password',
            accessCode: 'SOME-CODE',
        })
        expect(mocks.refresh).toHaveBeenCalledTimes(1)
        expect(clearSpy.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.replace.mock.invocationCallOrder[0]
        )
    })

    it('writes the access code in capitals', async () => {
        mocks.mutateAsync.mockResolvedValue({ status: 200 })
        render(<SignupCard />)
        fill('ana@example.com', 'secret-password', 'miguelinr1')

        expect(screen.getByTestId('signup-access-code')).toHaveValue('MIGUELINR1')
        submit()
        await waitFor(() => {
            expect(mocks.mutateAsync).toHaveBeenCalledWith({
                displayName: 'Ana Silva',
                email: 'ana@example.com',
                password: 'secret-password',
                accessCode: 'MIGUELINR1',
            })
        })
    })

    it('disables the submit button while the request is pending', async () => {
        mocks.mutateAsync.mockReturnValue(new Promise(() => {}))
        render(<SignupCard />)
        fill('ana@example.com', 'secret-password', 'some-code')
        expect(screen.getByTestId('signup-submit')).toBeEnabled()
        submit()

        await waitFor(() => {
            expect(screen.getByTestId('signup-submit')).toBeDisabled()
        })
    })
})
