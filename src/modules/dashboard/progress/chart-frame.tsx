import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

type Props = {
    label: string
    testId: string
    children: ReactNode
}

const FRAME = 'h-60 w-full min-w-0 md:h-72'

// Fixed height so loading never shifts the page; the label tells screen readers the message.
export function ChartFrame({ label, testId, children }: Props) {
    return (
        <div role="img" aria-label={label} data-testid={testId} className={FRAME}>
            {children}
        </div>
    )
}

export function ChartFrameSkeleton() {
    return <Skeleton className={FRAME} />
}
