import { Button } from '@/components/ui/button'

type Props = {
    provider: 'Lyfta' | 'Zepp'
    items: 'workouts' | 'runs'
    // The imported activities; undefined while it is not known (loading or failed).
    count: number | undefined
    // True while a sync, a reconnect or another action runs.
    disabled: boolean
    onClear: () => void
    onDisconnect: () => void
    testIdPrefix: string
}

type RowProps = {
    title: string
    hint: string
    hintTestId?: string
    buttonLabel: string
    buttonTestId: string
    disabled: boolean
    onClick: () => void
}

function DangerRow({
    title,
    hint,
    hintTestId,
    buttonLabel,
    buttonTestId,
    disabled,
    onClick,
}: RowProps) {
    return (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="grid gap-0.5">
                <p className="text-sm font-medium">{title}</p>
                <p data-testid={hintTestId} className="text-sm text-muted-foreground">
                    {hint}
                </p>
            </div>
            <Button
                type="button"
                variant="destructive"
                className="min-h-11 w-full cursor-pointer md:w-auto md:min-w-40"
                data-testid={buttonTestId}
                disabled={disabled}
                onClick={onClick}
            >
                {buttonLabel}
            </Button>
        </div>
    )
}

// The destructive actions of an integration card, apart from Sync and kept away from it.
export function IntegrationDangerZone({
    provider,
    items,
    count,
    disabled,
    onClear,
    onDisconnect,
    testIdPrefix,
}: Props) {
    const headingId = `${testIdPrefix}-danger-heading`
    const clearHint =
        count === undefined
            ? `Delete the ${items} imported from ${provider}.`
            : `Delete the ${count} ${items} imported from ${provider}, with their data.`

    return (
        <section
            aria-labelledby={headingId}
            data-testid={`${testIdPrefix}-danger-zone`}
            className="grid gap-4 border-t border-hairline pt-5"
        >
            <h3 id={headingId} className="eyebrow text-muted-foreground">
                Danger zone
            </h3>
            <DangerRow
                title="Clear activities"
                hint={clearHint}
                hintTestId={`${testIdPrefix}-clear-hint`}
                buttonLabel="Clear activities"
                buttonTestId={`${testIdPrefix}-clear`}
                disabled={disabled || count === undefined || count === 0}
                onClick={onClear}
            />
            <DangerRow
                title={`Disconnect ${provider}`}
                hint="Stop syncing. Imported activities stay in your training history."
                buttonLabel="Disconnect"
                buttonTestId={`${testIdPrefix}-disconnect`}
                disabled={disabled}
                onClick={onDisconnect}
            />
        </section>
    )
}
