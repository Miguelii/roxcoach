import 'server-only'

import { Effect } from 'effect'
import { z } from 'zod'
import { DASHBOARD_MODES, type DashboardMode } from '@/_bff/core/constants/athlete.constants'
import { HYROX_DIVISION_KEYS } from '@/_bff/core/constants/hyrox.constants'
import type { createDBAdminClient, createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { ProfileQueryError } from '@/_bff/lib/errors'
import type { ProfileDTO, ProfileInput } from '@/_bff/modules/athlete/types'

// The service-role client (jobs, webhook) or the signed-in user's client.
type ProfilesClient =
    | ReturnType<typeof createDBAdminClient>
    | Awaited<ReturnType<typeof createDBServerClient>>

const TABLE = 'athlete_profiles'

// The column default, used when the athlete has no profile row yet.
const DEFAULT_TIMEZONE = 'Europe/Lisbon'

const timezoneRowSchema = z.object({ timezone: z.string().min(1) })

export const selectTimezone = Effect.fn('selectTimezone')(function* (
    supabase: ProfilesClient,
    userId: string
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () => supabase.from(TABLE).select('timezone').eq('user_id', userId).maybeSingle(),
        catch: (cause) =>
            new ProfileQueryError({
                cause: String(cause),
                error_hash: ErrorCode.ATHLETE_PROFILE_SELECT,
            }),
    })

    if (error)
        return yield* new ProfileQueryError({
            cause: `${error.code}: ${error.message}`,
            error_hash: ErrorCode.ATHLETE_PROFILE_SELECT_ERR,
        })
    if (data === null) return DEFAULT_TIMEZONE

    const parsed = timezoneRowSchema.safeParse(data)
    if (!parsed.success)
        return yield* new ProfileQueryError({
            cause: `Row failed schema validation: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
            error_hash: ErrorCode.ATHLETE_PROFILE_SELECT_PARSE,
        })

    return parsed.data.timezone
})

// PostgREST serializes numeric as a JSON number, but a string is accepted too.
const numeric = z
    .union([
        z.number(),
        z
            .string()
            .regex(/^-?\d+(\.\d+)?$/u)
            .transform(Number),
    ])
    .nullable()

const profileRowSchema = z.object({
    display_name: z.string(),
    timezone: z.string().min(1),
    max_hr: numeric,
    resting_hr: numeric,
    hyrox_division: z.enum(HYROX_DIVISION_KEYS).nullable(),
    weekly_hours_cap: numeric,
    notes: z.string().nullable(),
    dashboard_mode: z.enum(DASHBOARD_MODES),
})

const PROFILE_COLUMNS =
    'display_name, timezone, max_hr, resting_hr, hyrox_division, weekly_hours_cap, notes, dashboard_mode'

export const selectProfile = Effect.fn('selectProfile')(function* (
    supabase: ProfilesClient,
    userId: string
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () => supabase.from(TABLE).select(PROFILE_COLUMNS).eq('user_id', userId).maybeSingle(),
        catch: (cause) =>
            new ProfileQueryError({
                cause: String(cause),
                error_hash: ErrorCode.ATHLETE_PROFILE_FULL_SELECT,
            }),
    })

    if (error)
        return yield* new ProfileQueryError({
            cause: `${error.code}: ${error.message}`,
            error_hash: ErrorCode.ATHLETE_PROFILE_FULL_SELECT_ERR,
        })
    if (data === null) return null

    const parsed = profileRowSchema.safeParse(data)
    if (!parsed.success)
        return yield* new ProfileQueryError({
            cause: `Row failed schema validation: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
            error_hash: ErrorCode.ATHLETE_PROFILE_FULL_SELECT_PARSE,
        })

    const row = parsed.data
    const profile: ProfileDTO = {
        displayName: row.display_name,
        timezone: row.timezone,
        maxHr: row.max_hr,
        restingHr: row.resting_hr,
        hyroxDivision: row.hyrox_division,
        weeklyHoursCap: row.weekly_hours_cap,
        notes: row.notes,
        dashboardMode: row.dashboard_mode,
    }
    return profile
})

export const upsertProfile = Effect.fn('upsertProfile')(function* (
    supabase: ProfilesClient,
    userId: string,
    input: ProfileInput
) {
    const { error } = yield* Effect.tryPromise({
        try: () =>
            supabase.from(TABLE).upsert(
                {
                    user_id: userId,
                    display_name: input.displayName,
                    timezone: input.timezone,
                    max_hr: input.maxHr,
                    resting_hr: input.restingHr,
                    hyrox_division: input.hyroxDivision,
                    weekly_hours_cap: input.weeklyHoursCap,
                    notes: input.notes,
                },
                { onConflict: 'user_id' }
            ),
        catch: (cause) =>
            new ProfileQueryError({
                cause: String(cause),
                error_hash: ErrorCode.ATHLETE_PROFILE_UPSERT,
            }),
    })

    if (error)
        return yield* new ProfileQueryError({
            cause: `${error.code}: ${error.message}`,
            error_hash: ErrorCode.ATHLETE_PROFILE_UPSERT_ERR,
        })
})

// Updates only the dashboard mode. The profile row must exist: an update that matches no row is a
// failure, because the athlete would otherwise believe the choice was saved.
export const updateDashboardMode = Effect.fn('updateDashboardMode')(function* (
    supabase: ProfilesClient,
    userId: string,
    mode: DashboardMode
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .update({ dashboard_mode: mode })
                .eq('user_id', userId)
                .select('user_id'),
        catch: (cause) =>
            new ProfileQueryError({
                cause: String(cause),
                error_hash: ErrorCode.ATHLETE_DASHBOARD_MODE_UPDATE,
            }),
    })

    if (error)
        return yield* new ProfileQueryError({
            cause: `${error.code}: ${error.message}`,
            error_hash: ErrorCode.ATHLETE_DASHBOARD_MODE_UPDATE_ERR,
        })
    if (!Array.isArray(data) || data.length === 0)
        return yield* new ProfileQueryError({
            cause: 'no profile row to update',
            error_hash: ErrorCode.ATHLETE_DASHBOARD_MODE_UPDATE_ERR,
        })
})
