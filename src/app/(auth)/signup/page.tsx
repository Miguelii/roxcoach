import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { SignupCard } from '@/modules/auth/signup-card'
import { ServerEnv } from '@/env/server'

export const metadata: Metadata = {
    title: 'Create account',
    robots: { index: false, follow: false },
}

// Sign-up is closed (a 404) until NEXT_SIGNUP_ACCESS_CODE is set. The env is read per request.
async function SignupContent() {
    await connection()
    if (ServerEnv.NEXT_SIGNUP_ACCESS_CODE === undefined) notFound()
    return <SignupCard />
}

export default function SignupPage() {
    return (
        <Suspense fallback={null}>
            <SignupContent />
        </Suspense>
    )
}
