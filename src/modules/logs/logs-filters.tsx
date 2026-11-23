import { LOG_LEVEL_BADGE_CLASS, LOG_LEVEL_LABEL } from '@/modules/logs/logs-ui.constants'
import type { LogFacet } from '@/modules/logs/logs.utils'
import { cn } from '@/lib/utils'
import type { LogLevel } from '@/_bff/core/constants/logs.constants'

type Props = {
    levels: LogLevel[]
    sources: string[]
    levelFacets: LogFacet[]
    sourceFacets: LogFacet[]
    hasFilters: boolean
    onToggleLevel: (level: LogLevel) => void
    onToggleSource: (source: string) => void
    onClear: () => void
}

type PillProps = {
    testId: string
    label: string
    count: number
    selected: boolean
    className?: string
    onClick: () => void
}

function FilterPill({ testId, label, count, selected, className, onClick }: PillProps) {
    return (
        <button
            type="button"
            data-testid={testId}
            aria-pressed={selected}
            onClick={onClick}
            className={cn(
                'flex h-9 cursor-pointer items-center gap-2 rounded-full px-3 text-sm font-medium ring-1 ring-hairline transition-colors duration-200 motion-reduce:transition-none',
                selected ? 'bg-ink text-primary-foreground ring-ink' : 'bg-card hover:bg-muted',
                className
            )}
        >
            {label}
            <span className="tabular-nums opacity-70">{count}</span>
        </button>
    )
}

const LEVEL_ORDER: LogLevel[] = ['error', 'warn', 'info', 'debug']

export function LogsFilters({
    levels,
    sources,
    levelFacets,
    sourceFacets,
    hasFilters,
    onToggleLevel,
    onToggleSource,
    onClear,
}: Props) {
    const levelCount = (level: LogLevel) =>
        levelFacets.find((facet) => facet.value === level)?.count ?? 0

    return (
        <div className="flex flex-wrap items-center gap-2" data-testid="logs-filters">
            {LEVEL_ORDER.map((level) => (
                <FilterPill
                    key={level}
                    testId={`logs-filter-level-${level}`}
                    label={LOG_LEVEL_LABEL[level]}
                    count={levelCount(level)}
                    selected={levels.includes(level)}
                    className={levels.includes(level) ? undefined : LOG_LEVEL_BADGE_CLASS[level]}
                    onClick={() => onToggleLevel(level)}
                />
            ))}
            {sourceFacets.map((facet) => (
                <FilterPill
                    key={facet.value}
                    testId={`logs-filter-source-${facet.value}`}
                    label={facet.value}
                    count={facet.count}
                    selected={sources.includes(facet.value)}
                    onClick={() => onToggleSource(facet.value)}
                />
            ))}
            {hasFilters ? (
                <button
                    type="button"
                    data-testid="logs-clear-filters"
                    onClick={onClear}
                    className="h-9 cursor-pointer rounded-full px-3 text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                    Clear filters
                </button>
            ) : null}
        </div>
    )
}
