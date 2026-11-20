'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { IconLoader2 } from '@tabler/icons-react'
import { safeReturnTo } from '@/_bff/core/helpers/safe-redirect.helper'
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
import { trpcClient } from '@/lib/trpc'
import { useLoginForm, type LoginValues } from '@/modules/auth/use-login-form'

type Props = {
    returnTo?: string
}

// The only failure copy the UI ever shows. The server error message is an internal hash and is
// never rendered, so a wrong password and an account without access look identical.
const LOGIN_ERROR_COPY = 'Invalid email or password'

export function LoginCard({ returnTo }: Props) {
    const router = useRouter()
    const queryClient = useQueryClient()
    const form = useLoginForm()
    const login = trpcClient.auth.login.useMutation()
    const [failed, setFailed] = useState(false)

    const onSubmit = async (values: LoginValues) => {
        setFailed(false)
        const request: Promise<{ status: 200 }> = login.mutateAsync(values)
        try {
            await request
        } catch {
            setFailed(true)
            return
        }
        // Drop any data cached for a previous session before the next user lands on the app.
        queryClient.clear()
        router.replace(safeReturnTo(returnTo))
        router.refresh()
    }

    return (
        <div
            data-testid="login-card"
            className="w-full max-w-sm rounded-lg border border-hairline bg-card p-8"
        >
            <h1 className="display text-4xl text-ink">Roxcoach</h1>
            <p className="mt-1 mb-6 text-sm text-muted-foreground">Sign in to continue.</p>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
                    <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Email</FormLabel>
                                <FormControl>
                                    <Input
                                        data-testid="login-email"
                                        type="email"
                                        autoComplete="username"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage data-testid="login-email-error" />
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
                                    <Input
                                        data-testid="login-password"
                                        type="password"
                                        autoComplete="current-password"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage data-testid="login-password-error" />
                            </FormItem>
                        )}
                    />

                    {failed && (
                        <p
                            data-testid="login-error"
                            role="alert"
                            className="text-sm text-destructive"
                        >
                            {LOGIN_ERROR_COPY}
                        </p>
                    )}

                    <Button
                        data-testid="login-submit"
                        type="submit"
                        variant="ink"
                        className="w-full"
                        disabled={form.formState.isSubmitting}
                    >
                        {form.formState.isSubmitting && <IconLoader2 className="animate-spin" />}
                        Sign in
                    </Button>
                </form>
            </Form>
        </div>
    )
}
