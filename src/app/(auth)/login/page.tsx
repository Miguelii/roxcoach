import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoginCard } from '@/modules/auth/login-card'
import { SignupLink } from '@/modules/auth/signup-link'

export const metadata: Metadata = {
    title: 'Sign in',
    // Protected pages redirect here with ?returnTo=, so every variant points to one URL.
    alternates: { canonical: '/login' },
}

export default function LoginPage() {
    return (
        <LoginCard
            footer={
                <Suspense fallback={null}>
                    <SignupLink />
                </Suspense>
            }
        />
    )
}
