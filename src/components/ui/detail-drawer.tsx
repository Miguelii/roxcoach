'use client'

import { XIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer'

type Props = {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description: string
    testId: string
    children: ReactNode
}

// Read-only sibling of DrawerFormLayout: a header with a close button and a scrollable body, no
// footer actions. A drawer from the bottom on a phone, a side panel on a wide screen.
export function DetailDrawer({ open, onOpenChange, title, description, testId, children }: Props) {
    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent
                data-testid={testId}
                className="bg-paper data-[vaul-drawer-direction=right]:sm:max-w-2xl"
            >
                <DrawerHeader className="border-b border-hairline p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2">
                            <DrawerTitle
                                className="display text-2xl font-bold"
                                data-testid={`${testId}-title`}
                            >
                                {title}
                            </DrawerTitle>
                            <DrawerDescription data-testid={`${testId}-description`}>
                                {description}
                            </DrawerDescription>
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Close"
                            data-testid={`${testId}-close`}
                            onClick={() => onOpenChange(false)}
                        >
                            <XIcon />
                        </Button>
                    </div>
                </DrawerHeader>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
                    {children}
                </div>
            </DrawerContent>
        </Drawer>
    )
}
