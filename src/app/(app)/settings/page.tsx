import type { Metadata } from 'next'
import { Suspense } from 'react'
import { z } from 'zod'
import { SettingsView } from '@/modules/settings/settings-view'

type Props = PageProps<'/settings'>

type SettingsWithTabProps = Pick<Props, 'searchParams'>

const tabParam = z.string()

export const metadata: Metadata = { title: 'Settings' }

// The tab comes from the URL, so it is read inside Suspense: the shell renders the default tab and
// navigations stay instant.
export default function SettingsPage({ searchParams }: Props) {
    return (
        <main className="main-container">
            <Suspense fallback={<SettingsView />}>
                <SettingsWithTab searchParams={searchParams} />
            </Suspense>
        </main>
    )
}

async function SettingsWithTab({ searchParams }: SettingsWithTabProps) {
    const { tab } = await searchParams
    return <SettingsView initialTab={tabParam.safeParse(tab).data} />
}
