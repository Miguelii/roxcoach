'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
    IconCalendar,
    IconChartLine,
    IconFlag,
    IconListDetails,
    IconLogout,
    IconSettings,
    IconSparkles,
    type Icon,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useTRPC } from '@/lib/trpc'
import { cn } from '@/lib/utils'
import { MobileNav } from '@/components/mobile-nav'
import { DashboardModeToggle } from '@/modules/dashboard/dashboard-mode-toggle'
import { useCoachPanel } from '@/modules/coach/coach-panel-context'

type NavItem = {
    href: string
    label: string
    Icon: Icon
    testId?: string
}

type Props = {
    children: React.ReactNode
    isAdmin: boolean
}

type AccountMenuProps = {
    isPending: boolean
    onLogout: () => void
}

const PRIMARY_NAV_ITEMS: NavItem[] = [
    { href: '/dashboard', label: 'Dashboard', Icon: IconChartLine },
    { href: '/calendar', label: 'Calendar', Icon: IconCalendar },
    { href: '/races', label: 'Races', Icon: IconFlag },
    { href: '/settings', label: 'Settings', Icon: IconSettings },
]

const MOBILE_NAV_ITEMS = PRIMARY_NAV_ITEMS

const LOGS_NAV_ITEM: NavItem = {
    href: '/logs',
    label: 'Logs',
    Icon: IconListDetails,
    testId: 'nav-logs',
}

// The phone top bar has a direct Log out icon button; the desktop sidebar has a labelled one.
function MobileLogoutButton({ isPending, onLogout }: AccountMenuProps) {
    return (
        <Button
            variant="outline"
            size="icon"
            aria-label="Log out"
            data-testid="logout-button-mobile"
            disabled={isPending}
            onClick={onLogout}
        >
            <IconLogout className="size-5" aria-hidden="true" />
        </Button>
    )
}

export function AppShell({ children, isAdmin }: Props) {
    const {
        setOpen: setCoachOpen,
        enabled: coachEnabled,
        setEnabled: setCoachEnabled,
    } = useCoachPanel()
    const pathname = usePathname()
    const router = useRouter()
    const trpc = useTRPC()
    const queryClient = useQueryClient()
    const logout = useMutation(trpc.auth.logout.mutationOptions())
    const desktopNavItems = isAdmin ? [...PRIMARY_NAV_ITEMS, LOGS_NAV_ITEM] : PRIMARY_NAV_ITEMS
    const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
    const activeIndex = desktopNavItems.findIndex((item) => isActive(item.href))

    const onLogout = async () => {
        const request: Promise<{ status: 200 }> = logout.mutateAsync()
        try {
            await request
        } catch {
            toast.error('Could not log out. Please try again.')
            return
        }
        queryClient.clear()
        router.replace('/login')
        router.refresh()
    }

    return (
        <div className="min-h-dvh bg-background md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
            <aside className="sticky top-0 hidden h-dvh flex-col border-r border-hairline bg-paper px-4 py-6 md:flex">
                <Link href="/dashboard" className="display px-3 text-2xl text-ink">
                    ROXCOACH
                </Link>

                <nav
                    aria-label="Primary"
                    data-testid="nav-desktop"
                    className="relative mt-10 flex flex-col gap-1"
                >
                    {activeIndex >= 0 ? (
                        <span
                            aria-hidden="true"
                            data-testid="nav-desktop-indicator"
                            style={{
                                transform: `translateY(calc(${activeIndex} * (100% + 0.25rem)))`,
                            }}
                            className="pointer-events-none absolute inset-x-0 top-0 h-11 rounded-[var(--radius-surface-inner)] bg-ink transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
                        />
                    ) : null}
                    {desktopNavItems.map(({ href, label, Icon, testId }) => (
                        <Link
                            key={href}
                            data-testid={testId}
                            href={href}
                            prefetch={true}
                            aria-current={isActive(href) ? 'page' : undefined}
                            className={cn(
                                'relative flex h-11 items-center gap-3 rounded-[var(--radius-surface-inner)] px-3 text-sm font-medium transition-colors duration-300',
                                isActive(href)
                                    ? 'text-primary-foreground'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            )}
                        >
                            <Icon className="size-5" />
                            {label}
                        </Link>
                    ))}
                    <div className="flex h-11 items-center gap-3 px-3 text-sm font-medium text-muted-foreground">
                        <IconSparkles className="size-5" />
                        <span id="coach-toggle-label" className="flex-1">
                            Coach
                        </span>
                        <Switch
                            data-testid="coach-toggle"
                            aria-labelledby="coach-toggle-label"
                            checked={coachEnabled}
                            onCheckedChange={setCoachEnabled}
                        />
                    </div>
                </nav>

                <div className="mt-auto space-y-4 border-t border-hairline pt-4">
                    <div className="space-y-1.5 px-1">
                        <p className="eyebrow text-muted-foreground">Dashboard</p>
                        <DashboardModeToggle testIdPrefix="nav-mode" compact />
                    </div>
                    <Button
                        variant="ghost"
                        data-testid="logout-button"
                        disabled={logout.isPending}
                        onClick={onLogout}
                        className="w-full justify-start gap-3 px-3 text-muted-foreground"
                    >
                        <IconLogout className="size-5" aria-hidden="true" />
                        Log out
                    </Button>
                </div>
            </aside>

            <div className="min-w-0">
                <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-hairline bg-paper/95 px-4 backdrop-blur md:hidden">
                    <Link href="/dashboard" className="display text-xl text-ink">
                        ROXCOACH
                    </Link>
                    <MobileLogoutButton isPending={logout.isPending} onLogout={onLogout} />
                </header>

                <div className="pb-24 md:pb-6">{children}</div>
            </div>

            <MobileNav
                items={MOBILE_NAV_ITEMS}
                isActive={isActive}
                onCoach={() => setCoachOpen(true)}
            />
        </div>
    )
}
