import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { DUPLICATE_WINDOW_SECONDS } from '@/_bff/core/constants/import.constants'
import { localDateIn } from '@/_bff/core/utils/date.utils'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { ZeppImportError } from '@/_bff/lib/errors'
import { buildHrHistogram } from '@/_bff/modules/training/helpers/build-hr-histogram.helper'
import { buildPaceHistogram } from '@/_bff/modules/training/helpers/build-pace-histogram.helper'
import {
    deleteActivity,
    insertZeppActivity,
    selectIdNearStartedAt,
    selectSourceIds,
    selectStartedAtsBetween,
    selectZeppActivityIds,
} from '@/_bff/modules/training/repositories/activities.repository'
import {
    replaceLaps,
    selectActivityIdsWithLaps,
} from '@/_bff/modules/training/repositories/activity-laps.repository'
import type { ImportContext } from '@/_bff/modules/training/services/import-context.service'
import type { LapRow, ParsedLap } from '@/_bff/modules/training/types'
import type { AdaptedActivity, ZeppRunSummary } from '@/_bff/modules/zepp/types'

const toLapRows = (laps: ParsedLap[]): LapRow[] =>
    laps.map((lap) => ({
        lap_index: lap.lapIndex,
        name: lap.name,
        distance_m: lap.distanceM,
        elapsed_time_s: lap.elapsedTimeS,
        moving_time_s: lap.movingTimeS,
        avg_hr: lap.avgHr,
        avg_speed_mps: lap.avgSpeedMps,
        station: null,
    }))

export const findKnownZeppTrackIds = Effect.fn('findKnownZeppTrackIds')(function* (
    user: User,
    trackIds: string[],
    context: ImportContext
) {
    return yield* selectSourceIds(context.supabase, user.id, 'zepp', trackIds)
})

// The runs that start within the duplicate window of an activity the athlete already has from
// another source (for example a Zepp file uploaded by hand), found with one query for all of them.
export const findZeppDuplicateTrackIds = Effect.fn('findZeppDuplicateTrackIds')(function* (
    user: User,
    trackIds: string[],
    context: ImportContext
) {
    if (trackIds.length === 0) return new Set<string>()

    const windowMs = DUPLICATE_WINDOW_SECONDS * 1000
    const startsMs = trackIds.map((id) => Number(id) * 1000)
    const existing = yield* selectStartedAtsBetween(
        context.supabase,
        user.id,
        new Date(Math.min(...startsMs) - windowMs).toISOString(),
        new Date(Math.max(...startsMs) + windowMs).toISOString(),
        'zepp'
    )
    const existingMs = existing.map((iso) => Date.parse(iso))
    return new Set(
        trackIds.filter((id) =>
            existingMs.some((start) => Math.abs(start - Number(id) * 1000) <= windowMs)
        )
    )
})

// Skips a run that starts within the duplicate window of an activity the athlete already has, for
// example the same workout uploaded by hand from a Zepp file.
export const importZeppActivity = Effect.fn('importZeppActivity')(function* (
    user: User,
    summary: ZeppRunSummary,
    activity: AdaptedActivity,
    context: ImportContext
) {
    const { supabase, timeZone } = context
    const localDate = yield* Effect.try({
        try: () => localDateIn(activity.startedAt, timeZone),
        catch: () =>
            new ZeppImportError({
                cause: 'Could not calculate the athlete-local run date',
                error_hash: ErrorCode.ZEPP_IMPORT,
            }),
    })

    const nearby = yield* selectIdNearStartedAt(
        supabase,
        user.id,
        activity.startedAt,
        DUPLICATE_WINDOW_SECONDS,
        'zepp'
    )
    if (nearby !== null) return { created: false }

    const inserted = yield* insertZeppActivity(supabase, user.id, {
        source_id: summary.trackId,
        sport_type: activity.sportType,
        category: activity.category,
        name: activity.name,
        started_at: activity.startedAt,
        local_date: localDate,
        distance_m: activity.distanceM,
        moving_time_s: activity.movingTimeS,
        elapsed_time_s: activity.elapsedTimeS,
        elevation_gain_m: activity.elevationGainM,
        avg_hr: activity.avgHr,
        max_hr: activity.maxHr,
        avg_speed_mps: activity.avgSpeedMps,
        calories: activity.calories,
        hr_histogram: buildHrHistogram(activity.samples),
        pace_histogram: buildPaceHistogram(activity.samples),
    })
    if (!inserted.created || activity.laps.length === 0) return { created: inserted.created }

    // Without its laps the run would look imported and never be split, so it is removed and the
    // next sync imports it again.
    yield* replaceLaps(supabase, user.id, inserted.id, toLapRows(activity.laps)).pipe(
        Effect.onError(() => deleteActivity(supabase, user.id, inserted.id).pipe(Effect.ignore))
    )
    return { created: true }
})

// The Zepp runs already imported without laps (imported before laps existed), by track id.
export const findZeppRunsWithoutLaps = Effect.fn('findZeppRunsWithoutLaps')(function* (
    user: User,
    trackIds: string[],
    context: ImportContext
) {
    if (trackIds.length === 0) return new Map<string, string>()

    const activities = yield* selectZeppActivityIds(context.supabase, user.id, trackIds)
    if (activities.length === 0) return new Map<string, string>()
    const withLaps = yield* selectActivityIdsWithLaps(
        context.supabase,
        user.id,
        activities.map((activity) => activity.id)
    )
    return new Map(
        activities.flatMap((activity) =>
            withLaps.has(activity.id) ? [] : [[activity.sourceId, activity.id] as const]
        )
    )
})

export const replaceZeppLaps = Effect.fn('replaceZeppLaps')(function* (
    user: User,
    activityId: string,
    laps: ParsedLap[],
    context: ImportContext
) {
    yield* replaceLaps(context.supabase, user.id, activityId, toLapRows(laps))
})
