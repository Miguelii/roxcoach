'use client'

import { XIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'

type Props = {
    title: string
    description: string
    closeLabel: string
    closeTestId: string
    cancelTestId: string
    closeDisabled: boolean
    onDismiss: () => void
    primaryAction: ReactNode
    children: ReactNode
}

export function DrawerFormLayout({
    title,
    description,
    closeLabel,
    closeTestId,
    cancelTestId,
    closeDisabled,
    onDismiss,
    primaryAction,
    children,
}: Props) {
    return (
        <>
            <DrawerHeader className="border-b border-hairline bg-paper p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                        <DrawerTitle
                            className="display text-3xl font-bold"
                            data-testid="drawer-form-title"
                        >
                            {title}
                        </DrawerTitle>
                        <DrawerDescription>{description}</DrawerDescription>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={closeLabel}
                        data-testid={closeTestId}
                        disabled={closeDisabled}
                        onClick={onDismiss}
                    >
                        <XIcon />
                    </Button>
                </div>
            </DrawerHeader>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">{children}</div>
            <div className="mt-0 flex shrink-0 justify-end gap-2 border-t border-hairline bg-paper p-4 sm:p-6">
                <Button
                    type="button"
                    variant="outline"
                    data-testid={cancelTestId}
                    disabled={closeDisabled}
                    onClick={onDismiss}
                >
                    Cancel
                </Button>
                {primaryAction}
            </div>
        </>
    )
}
