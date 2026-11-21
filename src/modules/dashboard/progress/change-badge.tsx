import { IconArrowDownRight, IconArrowUpRight, IconMinus } from '@tabler/icons-react'

type Props = {
    delta: number | null
    // Formats the size of the change, for example `5 kg` or `0:12 /km`.
    format: (absolute: number) => string
    testId: string
}

// A change with a sign, an arrow and text, never color alone.
export function ChangeBadge({ delta, format, testId }: Props) {
    if (delta === null)
        return (
            <span data-testid={testId} className="text-sm text-muted-foreground">
                -
            </span>
        )

    const Icon = delta > 0 ? IconArrowUpRight : delta < 0 ? IconArrowDownRight : IconMinus
    const sign = delta > 0 ? '+' : delta < 0 ? '-' : ''

    return (
        <span
            data-testid={testId}
            className="inline-flex items-center gap-1 text-sm font-medium tabular-nums"
        >
            <Icon className="size-4" aria-hidden="true" />
            {sign}
            {format(Math.abs(delta))}
        </span>
    )
}
