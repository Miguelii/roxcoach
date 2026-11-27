'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'
import { AUTH_PAGE_PATH } from '@/_bff/core/constants/auth.constants'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useTRPC } from '@/lib/trpc'

// Shown in the dialog for every failure; the server error is an internal code.
const DELETE_ERROR_COPY = 'Could not delete your profile. Nothing was removed, try again.'

// Danger zone at the end of the profile tab. Deleting removes the account and every piece of data
// the athlete has in Roxcoach (profile, goals, races, workouts and files, coach chats, Lyfta
// connection), so it always asks first.
export function DeleteProfileSection() {
    const trpc = useTRPC()
    const router = useRouter()
    const queryClient = useQueryClient()
    const deleteAccount = useMutation(trpc.athlete.deleteAccount.mutationOptions())
    const [open, setOpen] = useState(false)
    const [failed, setFailed] = useState(false)

    const onOpenChange = (next: boolean) => {
        setOpen(next)
        if (next) setFailed(false)
    }

    const onConfirm = async () => {
        setFailed(false)
        const request: Promise<{ status: 200 }> = deleteAccount.mutateAsync()
        try {
            await request
        } catch {
            setFailed(true)
            return
        }
        // Drop everything cached for this user before leaving the app.
        queryClient.clear()
        router.replace(AUTH_PAGE_PATH)
        router.refresh()
    }

    const deleting = deleteAccount.isPending

    return (
        <section
            data-testid="profile-delete-section"
            className="mt-10 max-w-xl space-y-3 border-t border-hairline pt-6"
        >
            <h2 className="text-sm font-medium text-ink">Delete profile</h2>
            <p className="text-sm text-muted-foreground">
                Permanently deletes your account and all your data: workouts, races, goals, coach
                conversations, uploaded files and your Lyfta connection.
            </p>
            <Button
                type="button"
                variant="destructive"
                data-testid="profile-delete"
                onClick={() => onOpenChange(true)}
            >
                Delete profile
            </Button>

            <ConfirmDialog
                open={open}
                onOpenChange={onOpenChange}
                title="Delete your profile?"
                description="This permanently deletes your account, profile, goals, races, workouts, uploaded files, coach conversations and your Lyfta connection. This cannot be undone."
                descriptionTestId="profile-delete-description"
                testId="profile-delete-dialog"
                cancelLabel="Keep my profile"
                cancelTestId="profile-delete-cancel"
                busy={deleting}
                primaryAction={
                    <Button
                        type="button"
                        variant="destructive"
                        data-testid="profile-delete-confirm"
                        disabled={deleting}
                        onClick={() => void onConfirm()}
                    >
                        {deleting ? <Loader2Icon className="animate-spin" /> : null}
                        {deleting ? 'Deleting...' : 'Delete everything'}
                    </Button>
                }
            >
                {failed ? (
                    <p
                        role="alert"
                        data-testid="profile-delete-error"
                        className="text-sm text-destructive"
                    >
                        {DELETE_ERROR_COPY}
                    </p>
                ) : null}
            </ConfirmDialog>
        </section>
    )
}
