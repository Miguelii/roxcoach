'use client'

import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProfileDTO } from '@/_bff/modules/athlete/types'
import { Skeleton } from '@/components/ui/skeleton'
import { useTRPC } from '@/lib/trpc'
import { DeleteProfileSection } from '@/modules/settings/delete-profile-section'
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
    const trpc = useTRPC()
    const query = useQuery(
        trpc.athlete.getProfile.queryOptions(undefined, {
            meta: { errorMessage: 'Could not load your profile.' },
        })
    )
    const queryClient = useQueryClient()
    const update = useMutation(trpc.athlete.updateProfile.mutationOptions())

    if (query.isPending) return <Skeleton data-testid="profile-loading" className="h-96 max-w-xl" />
    if (query.data === undefined) return null

    const onSubmit = async (values: ProfileValues) => {
        try {
            await update.mutateAsync(values)
        } catch (error) {
            toast.error('Could not save your profile. Try again.')
            throw error
        }
        toast.success('Profile saved')
        void queryClient.invalidateQueries(trpc.athlete.getProfile.queryFilter())
        void queryClient.invalidateQueries(trpc.training.getRunProgress.queryFilter())
    }

    return (
        <>
            <ProfileForm
                defaults={toFormValues(query.data)}
                email={query.data.email}
                onSubmit={onSubmit}
            />
            <DeleteProfileSection />
        </>
    )
}
