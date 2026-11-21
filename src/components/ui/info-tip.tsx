'use client'

import { IconInfoCircle } from '@tabler/icons-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

type Props = {
    // What the tip is about, for the screen-reader name of the button ("About Est. 1RM").
    label: string
    children: React.ReactNode
    testId: string
    className?: string
}

// A small info button that explains a term. It opens on tap or keyboard (the only way on a phone)
// and also on hover from a desktop pointer. The touch target is padded to 44 px without moving the
// layout, and the content never leaves the screen (collision padding and a viewport-bound width).
export function InfoTip({ label, children, testId, className }: Props) {
    return (
        <Popover>
            <PopoverTrigger
                openOnHover
                delay={150}
                closeDelay={100}
                data-testid={`${testId}-trigger`}
                aria-label={`About ${label}`}
                className={cn(
                    'relative inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full align-middle text-muted-foreground',
                    'transition-colors duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-foreground focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-popup-open:text-foreground motion-reduce:transition-none',
                    // Invisible 44 px hit area around the 16 px icon.
                    'before:absolute before:-inset-3.5 before:content-[""]',
                    className
                )}
            >
                <IconInfoCircle className="size-4" aria-hidden="true" />
            </PopoverTrigger>
            <PopoverContent data-testid={`${testId}-content`}>{children}</PopoverContent>
        </Popover>
    )
}
