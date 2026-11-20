'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
    IconCalendar,
    IconChartLine,
    IconFlag,
    IconLogout,
    IconSettings,
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
import { trpcClient } from '@/lib/trpc'
import { cn } from '@/lib/utils'

type NavItem = {
    href: string
    label: string
    Icon: Icon
}

type Props = {
    children: React.ReactNode
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

export function AppShell({ children }: Props) {
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

                <div className="pb-20 md:pb-6">{children}</div>
            </div>

            <nav
                aria-label="Primary"
                data-testid="nav-mobile"
                className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-hairline bg-paper/95 backdrop-blur md:hidden"
            >
                {MOBILE_NAV_ITEMS.map(({ href, label, Icon }) => (
                    <Link
                        key={href}
                        href={href}
                        aria-current={isActive(href) ? 'page' : undefined}
                        className={cn(
                            'flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium',
                            isActive(href) ? 'text-ink' : 'text-muted-foreground'
                        )}
                    >
                        <Icon className="size-5" />
                        {label}
                    </Link>
                ))}
            </nav>
        </div>
    )
}
