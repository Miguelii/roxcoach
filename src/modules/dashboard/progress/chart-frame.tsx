import type { ReactNode } from 'react'

type Props = {
    label: string
    testId: string
    children: ReactNode
}

// Fixed height so loading never shifts the page; the label tells screen readers the message.
export function ChartFrame({ label, testId, children }: Props) {
    return (
        <div role="img" aria-label={label} data-testid={testId} className="h-60 w-full md:h-72">
            {children}
        </div>
    )
}
