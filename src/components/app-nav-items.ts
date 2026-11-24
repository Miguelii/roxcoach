import { IconCalendar, IconChartLine, IconFlag, IconSettings, type Icon } from '@tabler/icons-react'

export type NavItem = {
    href: string
    label: string
    Icon: Icon
    testId?: string
}

export const PRIMARY_NAV_ITEMS: NavItem[] = [
    { href: '/dashboard', label: 'Dashboard', Icon: IconChartLine },
    { href: '/calendar', label: 'Calendar', Icon: IconCalendar },
    { href: '/races', label: 'Races', Icon: IconFlag },
    { href: '/settings', label: 'Settings', Icon: IconSettings },
]
