import type { LogEntry } from '@/_bff/core/constants/logs.constants'
import { LOG_LEVEL_LABEL } from '@/modules/logs/logs-ui.constants'

type Props = {
    log: LogEntry
}

type FieldProps = {
    label: string
    testId: string
    children: string
}

function Field({ label, testId, children }: FieldProps) {
    return (
        <div className="space-y-1">
            <p className="eyebrow text-muted-foreground">{label}</p>
            <p data-testid={testId} className="text-sm break-words">
                {children}
            </p>
        </div>
    )
}

export function LogDetails({ log }: Props) {
    return (
        <>
            <Field label="Message" testId="log-details-message">
                {log.message ?? 'No message'}
            </Field>
            <Field label="Level" testId="log-details-level">
                {LOG_LEVEL_LABEL[log.level]}
            </Field>
            <Field label="Source" testId="log-details-source">
                {log.prefix}
            </Field>
            <Field label="Time" testId="log-details-time">
                {new Date(log.created_at).toLocaleString('en-US', {
                    dateStyle: 'medium',
                    timeStyle: 'medium',
                })}
            </Field>
            <Field label="User" testId="log-details-user">
                {log.user_id ?? 'None'}
            </Field>
            {log.metadata ? (
                <div className="space-y-1">
                    <p className="eyebrow text-muted-foreground">Metadata</p>
                    <pre
                        data-testid="log-details-metadata"
                        className="overflow-x-auto rounded-[var(--radius-surface-inner)] bg-sunken p-3 text-xs"
                    >
                        {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                </div>
            ) : null}
        </>
    )
}
