'use client'

import Link from 'next/link'
import { useState } from 'react'
import { IconChevronDown, IconRefresh } from '@tabler/icons-react'
import { Loader2Icon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { PopoverDrawer } from '@/components/ui/popover-drawer'
import { formatDateTime } from '@/lib/formatters'
import type { SyncSource } from '@/lib/sync-source'
import { cn } from '@/lib/utils'

type Props = {
    sources: SyncSource[]
}

type RowProps = {
    source: SyncSource
    onSync: (source: SyncSource) => void
}

const ROW_CLASSES =
    'flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-surface-inner)] px-3 py-2 text-left text-sm transition-colors duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60 md:min-h-10 motion-reduce:transition-none'

function RowText({ source, detail }: { source: SyncSource; detail: string }) {
    return (
        <span className="grid min-w-0 flex-1">
            <span className="font-medium">{source.name}</span>
            <span className="truncate text-xs text-muted-foreground">{detail}</span>
        </span>
    )
}

function SourceRow({ source, onSync }: RowProps) {
    const testId = `sync-source-${source.id}`

    const unavailable = source.status === 'loading' || source.status === 'error'
    let detail = 'Not synced yet'
    if (source.status === 'loading') detail = 'Loading'
    else if (source.status === 'error') detail = 'Could not load'
    else if (source.lastSyncedAt) detail = `Last synced ${formatDateTime(source.lastSyncedAt)}`

    return (
        <button
            type="button"
            data-testid={testId}
            className={ROW_CLASSES}
            disabled={unavailable || source.isSyncing}
            onClick={() => onSync(source)}
        >
            <RowText source={source} detail={detail} />
            {source.isSyncing ? (
                <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            ) : (
                <IconRefresh className="size-4 text-muted-foreground" aria-hidden="true" />
            )}
        </button>
    )
}

// One button for every integration: it opens the list, and each row syncs a single integration or
// links to Settings to connect it. A popover on a wide screen, a drawer from the bottom on a phone.
export function SyncIntegrations({ sources }: Props) {
    const [open, setOpen] = useState(false)
    const syncing = sources.some((source) => source.isSyncing)
    const listed = sources.filter((source) => source.status !== 'disconnected')

    const syncOne = (source: SyncSource) => {
        setOpen(false)
        void source.sync()
    }

    return (
        <div data-testid="sync-integrations" className="inline-flex w-full md:w-auto">
            <PopoverDrawer
                open={open}
                onOpenChange={setOpen}
                title="Sync"
                description="Choose an integration to bring in its latest activities."
                testId="sync-integrations-list"
                trigger={{
                    testId: 'sync-integrations-button',
                    ariaBusy: syncing,
                    className: cn(
                        buttonVariants({ variant: 'outline' }),
                        'h-11! w-full justify-center gap-2 rounded-full px-5 md:h-10! md:w-auto'
                    ),
                    children: (
                        <>
                            {syncing ? (
                                <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
                            ) : (
                                <IconRefresh className="size-4" aria-hidden="true" />
                            )}
                            Sync
                            <IconChevronDown
                                className={cn(
                                    'size-4 text-muted-foreground transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
                                    open && 'rotate-180'
                                )}
                                aria-hidden="true"
                            />
                        </>
                    ),
                }}
            >
                {listed.length === 0 ? (
                    <div
                        data-testid="sync-integrations-empty"
                        className="grid gap-1 px-3 py-2 text-sm"
                    >
                        <p className="font-medium">No integration connected</p>
                        <Link
                            href="/settings"
                            data-testid="sync-integrations-settings"
                            className="text-muted-foreground underline underline-offset-4"
                        >
                            Connect one in Settings
                        </Link>
                    </div>
                ) : (
                    listed.map((source) => (
                        <SourceRow key={source.id} source={source} onSync={syncOne} />
                    ))
                )}
            </PopoverDrawer>
        </div>
    )
}
