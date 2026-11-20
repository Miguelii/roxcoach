import { Suspense } from 'react'
import { AppShell } from '@/components/app-shell'
import { CoachChat } from '@/modules/coach/coach-chat'

// The shell reads the pathname, which is request-time data on dynamic routes such as
// /activities/[id], so it streams in behind a boundary instead of blocking the prerender.
export default function AppLayout({ children }: LayoutProps<'/'>) {
    return (
        <>
            <Suspense fallback={null}>
                <AppShell>{children}</AppShell>
            </Suspense>
            <CoachChat />
        </>
    )
}
