import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { SettingsView } from '@/modules/settings/settings-view'

type Props = PageProps<'/settings'>

export const metadata: Metadata = { title: 'Settings' }

export default function SettingsPage({ searchParams }: Props) {
    return (
        <main className="main-container">
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                <SettingsView searchParams={searchParams} />
            </Suspense>
        </main>
    )
}
