import type { Metadata } from 'next'
import { z } from 'zod'
import { SettingsView } from '@/modules/settings/settings-view'

type Props = PageProps<'/settings'>

const tabParam = z.string()

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage({ searchParams }: Props) {
    const { tab } = await searchParams
    return (
        <main className="main-container">
            <SettingsView initialTab={tabParam.safeParse(tab).data} />
        </main>
    )
}
