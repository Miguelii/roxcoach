'use client'

import type { ReactNode } from 'react'
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useIsMobile } from '@/hooks/use-mobile'

type Props = {
    open: boolean
    onOpenChange: (open: boolean) => void
    // The button that opens it, styled by the caller.
    trigger: {
        testId: string
        className: string
        ariaBusy?: boolean
        children: ReactNode
    }
    // The title and description head the drawer on a phone; the popover has no header.
    title: string
    description: string
    testId: string
    children: ReactNode
}

// A list that opens under its button in a popover on a wide screen and, on a phone, as a drawer
// from the bottom, like the other sheets of the app.
export function PopoverDrawer({
    open,
    onOpenChange,
    trigger,
    title,
    description,
    testId,
    children,
}: Props) {
    const isMobile = useIsMobile()

    if (isMobile) {
        return (
            <>
                <button
                    type="button"
                    data-testid={trigger.testId}
                    aria-haspopup="dialog"
                    aria-busy={trigger.ariaBusy}
                    className={trigger.className}
                    onClick={() => onOpenChange(true)}
                >
                    {trigger.children}
                </button>
                <Drawer open={open} onOpenChange={onOpenChange}>
                    <DrawerContent
                        data-testid={testId}
                        data-presentation="drawer"
                        className="bg-paper"
                    >
                        <DrawerHeader className="gap-1 pt-2">
                            <DrawerTitle className="display text-xl">{title}</DrawerTitle>
                            <DrawerDescription>{description}</DrawerDescription>
                        </DrawerHeader>
                        <div className="max-h-[55dvh] overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
                            {children}
                        </div>
                    </DrawerContent>
                </Drawer>
            </>
        )
    }

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger
                data-testid={trigger.testId}
                aria-busy={trigger.ariaBusy}
                className={trigger.className}
            >
                {trigger.children}
            </PopoverTrigger>
            <PopoverContent
                side="bottom"
                align="start"
                data-testid={testId}
                data-presentation="popover"
                className="w-72 p-1.5"
            >
                {children}
            </PopoverContent>
        </Popover>
    )
}
