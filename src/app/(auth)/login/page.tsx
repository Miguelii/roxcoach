import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoginCard } from '@/modules/auth/login-card'
import { ServerEnv } from '@/env/server'

export const metadata: Metadata = {
    title: 'Sign in',
    // Protected pages redirect here with ?returnTo=, so every variant points to one URL.
    alternates: { canonical: '/login' },
}

type Props = PageProps<'/login'>

async function LoginContent({ searchParams }: Pick<Props, 'searchParams'>) {
    const { returnTo } = await searchParams
    return (
        <LoginCard
            returnTo={Array.isArray(returnTo) ? undefined : returnTo}
            signupOpen={ServerEnv.NEXT_SIGNUP_ACCESS_CODE !== undefined}
        />
    )
}

export default function LoginPage({ searchParams }: Props) {
    return (
        <Suspense fallback={null}>
            <LoginContent searchParams={searchParams} />
        </Suspense>
    )
}
