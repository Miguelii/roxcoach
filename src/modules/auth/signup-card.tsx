'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { IconLoader2 } from '@tabler/icons-react'
import { toast } from 'sonner'
import { AUTH_PAGE_PATH, DEFAULT_POST_AUTH_PATH } from '@/_bff/core/constants/auth.constants'
import { Button } from '@/components/ui/button'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { useTRPC } from '@/lib/trpc'
import { useSignupForm, type SignupValues } from '@/modules/auth/use-signup-form'

// The only failure copy the UI ever shows. The server message is an internal code and is never
// rendered, so a bad code, a taken email and a failed grant look identical.
const SIGNUP_ERROR_COPY = 'Could not create your account. Check your details and access code.'

export function SignupCard() {
    const trpc = useTRPC()
    const router = useRouter()
    const queryClient = useQueryClient()
    const form = useSignupForm()
    const signUp = useMutation(trpc.auth.signUp.mutationOptions())

    const onSubmit = async (values: SignupValues) => {
        const request: Promise<{ status: 200 }> = signUp.mutateAsync(values)
        try {
            await request
        } catch {
            toast.error(SIGNUP_ERROR_COPY, { id: 'signup-error' })
            return
        }
        // Drop any data cached for a previous session before the new user lands on the app.
        queryClient.clear()
        router.replace(DEFAULT_POST_AUTH_PATH)
        router.refresh()
    }

    return (
        <div
            data-testid="signup-card"
            className="w-full max-w-sm rounded-lg border border-hairline bg-card p-8 lg:rounded-none lg:border-0 lg:p-0"
        >
            <h1 className="display text-4xl text-ink">Roxcoach</h1>
            <p className="mt-1 mb-6 text-sm text-muted-foreground">Create your account.</p>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
                    <FormField
                        control={form.control}
                        name="displayName"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Name</FormLabel>
                                <FormControl>
                                    <Input
                                        data-testid="signup-name"
                                        autoComplete="name"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage data-testid="signup-name-error" />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Email</FormLabel>
                                <FormControl>
                                    <Input
                                        data-testid="signup-email"
                                        type="email"
                                        autoComplete="username"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage data-testid="signup-email-error" />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Password</FormLabel>
                                <FormControl>
                                    <PasswordInput
                                        data-testid="signup-password"
                                        autoComplete="new-password"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage data-testid="signup-password-error" />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="accessCode"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Access code</FormLabel>
                                <FormControl>
                                    <Input
                                        data-testid="signup-access-code"
                                        autoComplete="off"
                                        {...field}
                                        onChange={(event) =>
                                            field.onChange(event.target.value.toUpperCase())
                                        }
                                    />
                                </FormControl>
                                <FormMessage data-testid="signup-access-code-error" />
                            </FormItem>
                        )}
                    />

                    <Button
                        data-testid="signup-submit"
                        type="submit"
                        variant="ink"
                        className="w-full"
                        disabled={form.formState.isSubmitting}
                    >
                        {form.formState.isSubmitting && <IconLoader2 className="animate-spin" />}
                        Create account
                    </Button>
                </form>
            </Form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link
                    data-testid="signup-login-link"
                    href={AUTH_PAGE_PATH}
                    className="text-ink underline"
                >
                    Sign in
                </Link>
            </p>
        </div>
    )
}
