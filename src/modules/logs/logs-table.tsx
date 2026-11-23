import type { LogEntry, LogRange } from '@/_bff/core/constants/logs.constants'
import { cn } from '@/lib/utils'
import { LOG_LEVEL_BADGE_CLASS, LOG_LEVEL_LABEL } from '@/modules/logs/logs-ui.constants'
import { formatLogTime } from '@/modules/logs/logs.utils'

type Props = {
    logs: LogEntry[]
    range: LogRange
    onSelect: (id: string) => void
}

export function LogsTable({ logs, range, onSelect }: Props) {
    return (
        <ul data-testid="logs-table" className="divide-y divide-hairline">
            {logs.map((log) => (
                <li key={log.id}>
                    <button
                        type="button"
                        data-testid={`logs-row-${log.id}`}
                        onClick={() => onSelect(log.id)}
                        className="grid w-full cursor-pointer grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 px-4 py-3 text-left text-sm transition-colors duration-200 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none motion-reduce:transition-none md:grid-cols-[9rem_5.5rem_8rem_12rem_1fr]"
                    >
                        <span className="text-xs text-muted-foreground tabular-nums">
                            {formatLogTime(log.created_at, range)}
                        </span>
                        <span
                            className={cn(
                                'w-fit rounded-full px-2 py-0.5 text-xs font-medium',
                                LOG_LEVEL_BADGE_CLASS[log.level]
                            )}
                        >
                            {LOG_LEVEL_LABEL[log.level]}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{log.prefix}</span>
                        <span
                            data-testid={`logs-row-${log.id}-user`}
                            title={log.user_id ?? undefined}
                            className="col-span-2 flex min-w-0 flex-col text-xs md:col-span-1"
                        >
                            {log.user_id === null ? (
                                <span className="text-muted-foreground">-</span>
                            ) : (
                                <>
                                    <span className="truncate font-medium">
                                        {log.display_name ?? 'No profile'}
                                    </span>
                                    <span className="truncate font-mono text-muted-foreground">
                                        {log.user_id}
                                    </span>
                                </>
                            )}
                        </span>
                        <span className="col-span-2 truncate md:col-span-1">
                            {log.message ?? 'No message'}
                        </span>
                    </button>
                </li>
            ))}
        </ul>
    )
}
