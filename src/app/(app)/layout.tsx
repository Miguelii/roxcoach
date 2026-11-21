import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { AppShell } from '@/components/app-shell'
import { CoachChat } from '@/modules/coach/coach-chat'
import { CoachPanelProvider } from '@/modules/coach/coach-panel-context'
import { InstallPrompt } from '@/modules/pwa/install-prompt'
import { COACH_ENABLED_COOKIE } from '@/modules/coach/constants'

type Props = {
    children: React.ReactNode
}

// Reads the desktop coach preference on the server so the launcher renders in its final state.
async function CoachSession({ children }: Props) {
    const enabled = (await cookies()).get(COACH_ENABLED_COOKIE)?.value !== '0'
    return (
        <CoachPanelProvider initialEnabled={enabled}>
            <AppShell>{children}</AppShell>
            <CoachChat />
            <InstallPrompt />
        </CoachPanelProvider>
    )
}

// The shell reads the pathname and the cookie, which are request-time data (e.g. on dynamic
// routes such as /activities/[id]), so it streams in behind a boundary instead of blocking.
export default function AppLayout({ children }: LayoutProps<'/'>) {
    return (
        <Suspense fallback={null}>
            <CoachSession>{children}</CoachSession>
        </Suspense>
    )
}
