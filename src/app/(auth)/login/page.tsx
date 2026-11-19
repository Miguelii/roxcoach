import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoginCard } from '@/modules/auth/login-card'

export const metadata: Metadata = {
    title: 'Sign in',
    robots: { index: false, follow: false },
}

type Props = PageProps<'/login'>

async function LoginContent({ searchParams }: Pick<Props, 'searchParams'>) {
    const { returnTo } = await searchParams
    return <LoginCard returnTo={Array.isArray(returnTo) ? undefined : returnTo} />
}

export default function LoginPage({ searchParams }: Props) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-paper px-5 py-12">
            <Suspense fallback={null}>
                <LoginContent searchParams={searchParams} />
            </Suspense>
        </main>
    )
}
