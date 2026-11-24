import Link from 'next/link'
import { AppLoader } from '@/components/app-loader'
import { PRIMARY_NAV_ITEMS } from '@/components/app-nav-items'

// The frame of AppShell without anything that needs the request (admin link, coach toggle, active
// item). It is the Suspense fallback of the authenticated layout, so the app chrome is part of the
// static shell and paints before the dynamic render finishes.
export function AppShellSkeleton() {
    return (
        <div
            data-testid="app-shell-skeleton"
            className="min-h-dvh bg-background md:grid md:grid-cols-[15rem_minmax(0,1fr)]"
        >
            <aside className="sticky top-0 hidden h-dvh flex-col border-r border-hairline bg-paper px-4 py-6 md:flex">
                <Link href="/dashboard" className="display px-3 text-2xl text-ink">
                    ROXCOACH
                </Link>
                <nav aria-label="Primary" className="mt-10 flex flex-col gap-1">
                    {PRIMARY_NAV_ITEMS.map(({ href, label, Icon }) => (
                        <Link
                            key={href}
                            href={href}
                            className="flex h-11 items-center gap-3 rounded-[var(--radius-surface-inner)] px-3 text-sm font-medium text-muted-foreground"
                        >
                            <Icon className="size-5" />
                            {label}
                        </Link>
                    ))}
                </nav>
            </aside>
            <div className="min-w-0">
                <header className="sticky top-0 z-30 flex h-14 items-center border-b border-hairline bg-paper/95 px-4 backdrop-blur md:hidden">
                    <Link href="/dashboard" className="display text-xl text-ink">
                        ROXCOACH
                    </Link>
                </header>
                <AppLoader />
            </div>
        </div>
    )
}
