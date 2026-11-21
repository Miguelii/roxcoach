'use client'

import * as React from 'react'
import { Popover as PopoverPrimitive } from '@base-ui/react/popover'

import { cn } from '@/lib/utils'

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
    return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
    return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
    align = 'center',
    side = 'top',
    sideOffset = 8,
    collisionPadding = 16,
    className,
    ...props
}: PopoverPrimitive.Popup.Props &
    Pick<PopoverPrimitive.Positioner.Props, 'align' | 'side' | 'sideOffset' | 'collisionPadding'>) {
    return (
        <PopoverPrimitive.Portal>
            <PopoverPrimitive.Positioner
                className="isolate z-99 outline-none"
                align={align}
                side={side}
                sideOffset={sideOffset}
                collisionPadding={collisionPadding}
            >
                <PopoverPrimitive.Popup
                    data-slot="popover-content"
                    className={cn(
                        'w-max max-w-[min(20rem,calc(100vw-2rem))] origin-(--transform-origin) rounded-[var(--radius-surface-inner)] bg-popover p-3 text-sm leading-snug text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none',
                        'transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 motion-reduce:transition-none',
                        className
                    )}
                    {...props}
                />
            </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
    )
}

export { Popover, PopoverContent, PopoverTrigger }
