'use client'

import type { FormEventHandler, ReactNode } from 'react'
import { XIcon } from 'lucide-react'
import { Drawer, DrawerContent } from '@/components/ui/drawer'
import { DrawerFormLayout } from '@/components/ui/drawer-form-layout'
import { useIsMobile } from '@/hooks/use-mobile'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

type Props = {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description: string
    descriptionTestId?: string
    testId: string
    cancelLabel: string
    cancelTestId: string
    // The confirming button, passed in so each caller owns its variant, label and handler.
    primaryAction: ReactNode
    // While true the dialog cannot be closed (a request is running).
    busy?: boolean
    // Extra content between the header and the footer, e.g. an error message.
    children?: ReactNode
    // Makes the whole dialog a form: the primary action should then be a `type="submit"` button.
    form?: { onSubmit: FormEventHandler<HTMLFormElement>; testId: string }
}

type ShellProps = Pick<Props, 'form'> & { children: ReactNode }

function FormShell({ form, children }: ShellProps) {
    if (!form) return children
    return (
        <form
            data-testid={form.testId}
            onSubmit={form.onSubmit}
            noValidate
            className="flex min-h-0 flex-1 flex-col"
        >
            {children}
        </form>
    )
}

// Confirmation with the same look as the form drawers (bold display title, hairline header and
// footer on paper). It is a centered popup on desktop and, on a phone, the very same
// `DrawerFormLayout` drawer the forms use, so use it for
// short yes/no questions and keep `DrawerFormLayout` for real forms.
export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    descriptionTestId,
    testId,
    cancelLabel,
    cancelTestId,
    primaryAction,
    busy = false,
    children,
    form,
}: Props) {
    const isMobile = useIsMobile()

    if (isMobile) {
        return (
            <Drawer
                open={open}
                dismissible={!busy}
                onOpenChange={(next) => {
                    if (!busy || next) onOpenChange(next)
                }}
            >
                <DrawerContent role="alertdialog" data-testid={testId} className="w-full bg-paper">
                    <FormShell form={form}>
                        <DrawerFormLayout
                            title={title}
                            description={description}
                            descriptionTestId={descriptionTestId}
                            closeLabel="Close"
                            closeTestId={`${testId}-close`}
                            cancelTestId={cancelTestId}
                            cancelLabel={cancelLabel}
                            closeDisabled={busy}
                            onDismiss={() => onOpenChange(false)}
                            primaryAction={primaryAction}
                        >
                            {children}
                        </DrawerFormLayout>
                    </FormShell>
                </DrawerContent>
            </Drawer>
        )
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!busy || next) onOpenChange(next)
            }}
        >
            <DialogContent
                role="alertdialog"
                showCloseButton={false}
                data-testid={testId}
                className="gap-0 bg-paper p-0 md:max-w-md"
            >
                <FormShell form={form}>
                    <DialogHeader className="border-b border-hairline bg-paper p-5 sm:p-6">
                        <div className="flex items-start justify-between gap-4">
                            <div className="space-y-2">
                                <DialogTitle className="display text-3xl leading-tight font-bold">
                                    {title}
                                </DialogTitle>
                                <DialogDescription data-testid={descriptionTestId}>
                                    {description}
                                </DialogDescription>
                            </div>
                            <DialogClose
                                render={
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label="Close"
                                        data-testid={`${testId}-close`}
                                        disabled={busy}
                                    />
                                }
                            >
                                <XIcon />
                            </DialogClose>
                        </div>
                    </DialogHeader>
                    {children ? <div className="space-y-4 p-5 sm:p-6">{children}</div> : null}
                    <div className="flex w-full shrink-0 flex-col gap-2 border-t border-hairline bg-paper p-4 sm:p-6 md:flex-row md:items-center">
                        <DialogClose
                            render={
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full md:flex-1"
                                    data-testid={cancelTestId}
                                    disabled={busy}
                                />
                            }
                        >
                            {cancelLabel}
                        </DialogClose>
                        <div className="w-full md:flex-1 [&>button]:w-full">{primaryAction}</div>
                    </div>
                </FormShell>
            </DialogContent>
        </Dialog>
    )
}
