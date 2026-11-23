'use client'

import { useEffect, useState } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { LOG_RANGE_OPTIONS, SEARCH_DEBOUNCE_MS } from '@/modules/logs/logs-ui.constants'
import { useLogsUrlState } from '@/modules/logs/use-logs-url-state'

export function LogsToolbar() {
    const { range, search, setRange, setSearch } = useLogsUrlState()
    const [draft, setDraft] = useState(search)

    useEffect(() => {
        if (draft === search) return
        const timer = setTimeout(() => void setSearch(draft.trim()), SEARCH_DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [draft, search, setSearch])

    return (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div
                role="group"
                aria-label="Time range"
                className="flex w-fit gap-1 rounded-full bg-sunken p-1"
            >
                {LOG_RANGE_OPTIONS.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        data-testid={`logs-range-${option.value}`}
                        aria-pressed={range === option.value}
                        onClick={() => void setRange(option.value)}
                        className={cn(
                            'h-8 min-w-11 cursor-pointer rounded-full px-3 text-sm font-medium transition-colors duration-200 motion-reduce:transition-none',
                            range === option.value
                                ? 'bg-ink text-primary-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            <div className="relative md:w-72">
                <IconSearch
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                />
                <Input
                    type="search"
                    data-testid="logs-search"
                    aria-label="Search logs"
                    placeholder="Search message or source"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    className="h-11 rounded-full bg-card pl-9 md:h-10"
                />
            </div>
        </div>
    )
}
