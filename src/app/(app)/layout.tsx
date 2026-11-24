import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getCachedClaims } from '@/_bff/modules/auth/services/get-cached-claims.service'
import { AppShell } from '@/components/app-shell'
import { CoachChat } from '@/modules/coach/coach-chat'
import { CoachPanelProvider } from '@/modules/coach/coach-panel-context'
import { COACH_ENABLED_COOKIE } from '@/modules/coach/constants'

type Props = {
    children: React.ReactNode
}

// Reads the desktop coach preference on the server so the launcher renders in its final state.
// The admin flag only decides whether the Logs link is shown: the proxy and adminProcedure gate the
// page and its data. getClaims() checks the token expiry with Date.now(), which Cache Components
// only allows after connection().
async function CoachSession({ children }: Props) {
    await connection()
    const [cookieStore, claims] = await Promise.all([cookies(), getCachedClaims()])
    const enabled = cookieStore.get(COACH_ENABLED_COOKIE)?.value !== '0'
    return (
        <CoachPanelProvider initialEnabled={enabled}>
            <AppShell isAdmin={claims?.isAdmin ?? false}>{children}</AppShell>
            <CoachChat />
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
