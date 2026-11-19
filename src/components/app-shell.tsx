'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
    IconBrandStrava,
    IconCalendar,
    IconClipboardText,
    IconFlag,
    IconListDetails,
    IconLogout,
    IconSettings,
    type Icon,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
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

const NAV_ITEMS: NavItem[] = [
    { href: '/dashboard', label: 'Dashboard', Icon: IconCalendar },
    { href: '/coach', label: 'Coach', Icon: IconClipboardText },
    { href: '/plan', label: 'Plan', Icon: IconListDetails },
    { href: '/races', label: 'Races', Icon: IconFlag },
    { href: '/settings', label: 'Settings', Icon: IconSettings },
]

export function AppShell({ children }: Props) {
    const pathname = usePathname()
    const router = useRouter()
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
        router.replace('/login')
        router.refresh()
    }

    return (
        <div className="min-h-screen pb-20 md:pb-0">
            <header className="sticky top-0 z-40 border-b border-hairline bg-paper/90 backdrop-blur">
                <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-6 px-5 sm:px-8 lg:px-[50px]">
                    <Link href="/dashboard" className="display text-2xl text-ink">
                        Roxcoach
                    </Link>

                    <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
                        {NAV_ITEMS.map(({ href, label, Icon }) => (
                            <Link
                                key={href}
                                href={href}
                                aria-current={isActive(href) ? 'page' : undefined}
                                className={cn(
                                    'flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                                    isActive(href)
                                        ? 'bg-ink text-primary-foreground'
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                )}
                            >
                                <Icon className="size-4" />
                                {label}
                            </Link>
                        ))}
                    </nav>

                    <div className="ml-auto flex items-center gap-3">
                        <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                            <IconBrandStrava className="size-3.5 text-tangerine" />
                            Synced 12 min ago
                        </span>
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        aria-label="Account menu"
                                    />
                                }
                            >
                                <span className="font-mono text-xs">MG</span>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem render={<Link href="/settings" />}>
                                    <IconSettings /> Settings
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    data-testid="logout-button"
                                    disabled={logout.isPending}
                                    onClick={onLogout}
                                >
                                    <IconLogout /> Log out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </header>

            {children}

            <nav
                aria-label="Primary"
                className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-hairline bg-paper/95 backdrop-blur md:hidden"
            >
                {NAV_ITEMS.map(({ href, label, Icon }) => (
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
