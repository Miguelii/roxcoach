import { cn } from '@/lib/utils'

type Props = {
    connected: boolean
    testId: string
}

// The state is in the text, the tone only reinforces it.
export function IntegrationStatusPill({ connected, testId }: Props) {
    return (
        <span
            data-testid={testId}
            className={cn(
                'inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium',
                connected ? 'bg-green-soft text-green-deep' : 'bg-slate-soft text-slate-deep'
            )}
        >
            {connected ? 'Connected' : 'Not connected'}
        </span>
    )
}
