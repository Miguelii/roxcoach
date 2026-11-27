import { notFound } from 'next/navigation'
import { z } from 'zod'
import type {
    ActivityDTO,
    ExerciseComparisonDTO,
    LapDTO,
    StrengthSetDTO,
} from '@/_bff/modules/training/types'
import { ActivityView } from '@/modules/activity/activity-view'
import { RunTypeSection } from '@/modules/activity/run-type-section'

type Loaded = {
    activity: ActivityDTO
    laps: LapDTO[]
    strengthSets: StrengthSetDTO[]
    strengthComparisons?: ExerciseComparisonDTO[]
}

type Props = {
    params: Promise<{ id: string }>
    load: (id: string) => Promise<Loaded | null>
}

const idSchema = z.uuid()

// Resolves the route param, loads the activity and renders it. A malformed or unknown id is a 404.
// `load` reads cookies, so the caller must render this inside a Suspense boundary.
export async function ActivityDetail({ params, load }: Props) {
    const { id } = await params
    if (!idSchema.safeParse(id).success) notFound()

    const found = await load(id)
    if (found === null) notFound()

    return (
        <ActivityView
            activity={found.activity}
            laps={found.laps}
            strengthSets={found.strengthSets}
            strengthComparisons={found.strengthComparisons}
            runTypeControl={<RunTypeSection activity={found.activity} />}
        />
    )
}
