'use client'

import { useEffect, useState } from 'react'
import { IconCheck, IconCopy } from '@tabler/icons-react'
import type { LogEntry } from '@/_bff/core/constants/logs.constants'
import { Button } from '@/components/ui/button'
import { LOG_LEVEL_LABEL } from '@/modules/logs/logs-ui.constants'

type Props = {
    log: LogEntry
}

type FieldProps = {
    label: string
    testId: string
    children: string
}

const COPIED_RESET_MS = 1500

type CopyMetadataButtonProps = {
    text: string
}

function CopyMetadataButton({ text }: CopyMetadataButtonProps) {
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        if (!copied) return
        const timer = setTimeout(() => setCopied(false), COPIED_RESET_MS)
        return () => clearTimeout(timer)
    }, [copied])

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
        } catch {
            setCopied(false)
        }
    }

    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={copied ? 'Metadata copied' : 'Copy metadata'}
            data-testid="log-details-copy"
            data-copied={copied}
            onClick={() => void copy()}
        >
            {copied ? <IconCheck aria-hidden="true" /> : <IconCopy aria-hidden="true" />}
        </Button>
    )
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
    const userLabel =
        log.user_id === null ? 'None' : `${log.display_name ?? 'No profile'} (${log.user_id})`
    const metadata = log.metadata ? JSON.stringify(log.metadata, null, 2) : null

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
                {userLabel}
            </Field>
            {metadata ? (
                <div className="space-y-1">
                    <div className="flex items-center justify-between">
                        <p className="eyebrow text-muted-foreground">Metadata</p>
                        <CopyMetadataButton text={metadata} />
                    </div>
                    <pre
                        data-testid="log-details-metadata"
                        className="overflow-x-auto rounded-[var(--radius-surface-inner)] bg-sunken p-3 text-xs"
                    >
                        {metadata}
                    </pre>
                </div>
            ) : null}
        </>
    )
}
