'use client'

import { Switch as SwitchPrimitive } from '@base-ui/react/switch'

import { cn } from '@/lib/utils'

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
    return (
        <SwitchPrimitive.Root
            data-slot="switch"
            className={cn(
                'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-ink/30 bg-ink/15 p-0.5 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-checked:border-ink data-checked:bg-ink motion-reduce:transition-none',
                className
            )}
            {...props}
        >
            <SwitchPrimitive.Thumb
                data-slot="switch-thumb"
                className="pointer-events-none block size-4 rounded-full bg-ink/60 transition-[transform,background-color] data-checked:bg-paper data-checked:translate-x-4 motion-reduce:transition-none"
            />
        </SwitchPrimitive.Root>
    )
}

export { Switch }
