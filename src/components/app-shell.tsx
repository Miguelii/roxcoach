'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
    IconCalendar,
    IconChartLine,
    IconFlag,
    IconLogout,
    IconSettings,
    IconSparkles,
    type Icon,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { trpcClient } from '@/lib/trpc'
import { cn } from '@/lib/utils'
import { useCoachPanel } from '@/modules/coach/coach-panel-context'

type NavItem = {
    href: string
    label: string
    Icon: Icon
}

type Props = {
    children: React.ReactNode
}

type MobileNavLinkProps = {
    item: NavItem
    active: boolean
}

type AccountMenuProps = {
    isMobile?: boolean
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

function AccountMenu({ isMobile = false, isPending, onLogout }: AccountMenuProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button
                        variant={isMobile ? 'outline' : 'ghost'}
                        size={isMobile ? 'icon' : 'default'}
                        aria-label="Account menu"
                        data-testid={
                            isMobile ? 'account-menu-trigger-mobile' : 'account-menu-trigger'
                        }
                        className={isMobile ? undefined : 'w-full justify-start gap-3 px-2'}
                    />
                }
            >
                {isMobile ? (
                    <span className="font-mono text-xs">MG</span>
                ) : (
                    <>
                        <span className="flex size-8 items-center justify-center rounded-full bg-muted font-mono text-xs">
                            MG
                        </span>
                        <span className="text-sm font-medium">Account</span>
                    </>
                )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                    data-testid={isMobile ? 'logout-button-mobile' : 'logout-button'}
                    disabled={isPending}
                    onClick={onLogout}
                >
                    <IconLogout /> Log out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

function MobileNavLink({ item: { href, label, Icon }, active }: MobileNavLinkProps) {
    return (
        <Link
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
                'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium transition-colors motion-reduce:transition-none',
                active ? 'bg-ink/10 text-ink' : 'text-muted-foreground'
            )}
        >
            <Icon className="size-5" />
            {label}
        </Link>
    )
}

export function AppShell({ children }: Props) {
    const {
        setOpen: setCoachOpen,
        enabled: coachEnabled,
        setEnabled: setCoachEnabled,
    } = useCoachPanel()
    const pathname = usePathname()
    const router = useRouter()
    const queryClient = useQueryClient()
    const logout = trpcClient.auth.logout.useMutation()
    const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

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
                    className="mt-10 flex flex-col gap-1"
                >
                    {PRIMARY_NAV_ITEMS.map(({ href, label, Icon }) => (
                        <Link
                            key={href}
                            href={href}
                            aria-current={isActive(href) ? 'page' : undefined}
                            className={cn(
                                'flex h-11 items-center gap-3 rounded-[var(--radius-surface-inner)] px-3 text-sm font-medium transition-colors',
                                isActive(href)
                                    ? 'bg-ink text-primary-foreground'
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

                <div className="mt-auto border-t border-hairline pt-4">
                    <AccountMenu isPending={logout.isPending} onLogout={onLogout} />
                </div>
            </aside>

            <div className="min-w-0">
                <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-hairline bg-paper/95 px-4 backdrop-blur md:hidden">
                    <Link href="/dashboard" className="display text-xl text-ink">
                        ROXCOACH
                    </Link>
                    <AccountMenu isMobile isPending={logout.isPending} onLogout={onLogout} />
                </header>

                <div className="pb-28 md:pb-6">{children}</div>
            </div>

            <nav
                aria-label="Primary"
                data-testid="nav-mobile"
                className={cn(
                    'fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 md:hidden',
                    'grid grid-cols-5 items-center rounded-full p-1.5',
                    // Liquid glass: blurred, saturated backdrop with a bright rim and a soft shadow.
                    'border border-white/60 bg-paper/70 shadow-[0_8px_32px_rgba(23,24,28,0.14),inset_0_1px_0_rgba(255,255,255,0.7)]',
                    'backdrop-blur-xl backdrop-saturate-150',
                    // Solid fallback for users who asked for less transparency.
                    '[@media(prefers-reduced-transparency:reduce)]:bg-paper [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none'
                )}
            >
                {MOBILE_NAV_ITEMS.slice(0, 2).map((item) => (
                    <MobileNavLink key={item.href} item={item} active={isActive(item.href)} />
                ))}
                <button
                    type="button"
                    data-testid="nav-coach"
                    aria-label="Open coach chat"
                    onClick={() => setCoachOpen(true)}
                    className="mx-auto flex size-12 items-center justify-center rounded-full bg-ink text-primary-foreground shadow-md transition-transform active:scale-95 motion-reduce:transition-none"
                >
                    <IconSparkles className="size-6" />
                </button>
                {MOBILE_NAV_ITEMS.slice(2).map((item) => (
                    <MobileNavLink key={item.href} item={item} active={isActive(item.href)} />
                ))}
            </nav>
        </div>
    )
}
