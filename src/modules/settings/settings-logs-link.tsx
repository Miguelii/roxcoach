import Link from 'next/link'
import { IconChevronRight, IconListDetails } from '@tabler/icons-react'

export function SettingsLogsLink() {
    return (
        <Link
            href="/logs"
            data-testid="settings-logs-link"
            className="flex h-12 items-center gap-3 rounded-[var(--radius-surface-inner)] bg-card px-4 text-sm font-medium shadow-soft transition-colors duration-200 hover:bg-muted motion-reduce:transition-none"
        >
            <IconListDetails className="size-5 text-muted-foreground" aria-hidden="true" />
            <span className="flex-1">Logs</span>
            <IconChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
        </Link>
    )
}
