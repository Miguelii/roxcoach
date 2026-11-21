'use client'

import { toast } from 'sonner'
import type { ProfileDTO } from '@/_bff/modules/athlete/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { trpcClient } from '@/lib/trpc'
import { DashboardModeToggle } from '@/modules/dashboard/dashboard-mode-toggle'
import { ProfileForm } from '@/modules/settings/profile-form'
import type { ProfileFormValues, ProfileValues } from '@/modules/settings/use-profile-form'

// Numbers become strings and null becomes an empty string, as the inputs hold them.
const toFormValues = (profile: ProfileDTO): ProfileFormValues => ({
    displayName: profile.displayName,
    timezone: profile.timezone,
    maxHr: profile.maxHr === null ? '' : String(profile.maxHr),
    restingHr: profile.restingHr === null ? '' : String(profile.restingHr),
    hyroxDivision: profile.hyroxDivision ?? '',
    weeklyHoursCap: profile.weeklyHoursCap === null ? '' : String(profile.weeklyHoursCap),
    notes: profile.notes ?? '',
})

// Thin wrapper: fetches the profile and saves it. Covered through ProfileForm; it only wires trpc.
export function ProfileTab() {
    const query = trpcClient.athlete.getProfile.useQuery()
    const utils = trpcClient.useUtils()
    const update = trpcClient.athlete.updateProfile.useMutation()

    if (query.isPending) return <Skeleton data-testid="profile-loading" className="h-96 max-w-xl" />
    if (query.isError)
        return (
            <div data-testid="profile-error" className="space-y-3">
                <p className="text-sm text-destructive">Could not load your profile.</p>
                <Button
                    variant="outline"
                    data-testid="profile-retry"
                    onClick={() => void query.refetch()}
                >
                    Try again
                </Button>
            </div>
        )

    const onSubmit = async (values: ProfileValues) => {
        try {
            await update.mutateAsync(values)
        } catch (error) {
            toast.error('Could not save your profile. Try again.')
            throw error
        }
        toast.success('Profile saved')
        await Promise.all([
            utils.athlete.getProfile.invalidate(),
            utils.athlete.getTimezone.invalidate(),
            utils.training.getRunProgress.invalidate(),
        ])
    }

    return (
        <div className="space-y-8">
            <section
                data-testid="profile-dashboard-mode"
                aria-labelledby="profile-dashboard-mode-title"
                className="max-w-xl space-y-2"
            >
                <h3 id="profile-dashboard-mode-title" className="display text-xl">
                    Dashboard
                </h3>
                <p className="text-sm text-muted-foreground">
                    Choose the charts your dashboard shows. It is saved as you pick.
                </p>
                <DashboardModeToggle testIdPrefix="profile-mode" />
            </section>
            <ProfileForm defaults={toFormValues(query.data)} onSubmit={onSubmit} />
        </div>
    )
}
