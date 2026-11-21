import 'server-only'

import { Effect } from 'effect'
import { z } from 'zod'
import { SESSION_KINDS } from '@/_bff/core/constants/availability.constants'
import type { createDBAdminClient, createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { AvailabilityQueryError } from '@/_bff/lib/errors'
import type { AvailabilitySlotDTO } from '@/_bff/modules/athlete/types'

type SlotsClient =
    | ReturnType<typeof createDBAdminClient>
    | Awaited<ReturnType<typeof createDBServerClient>>

const TABLE = 'availability_slots'
const COLUMNS = 'weekday, session_kind, is_fixed, max_minutes, notes'

const slotRowSchema = z.object({
    weekday: z.number().int().min(1).max(7),
    session_kind: z.enum(SESSION_KINDS),
    is_fixed: z.boolean(),
    max_minutes: z.number().int().nullable(),
    notes: z.string().nullable(),
})

const toDTO = (row: z.infer<typeof slotRowSchema>): AvailabilitySlotDTO => ({
    weekday: row.weekday,
    sessionKind: row.session_kind,
    isFixed: row.is_fixed,
    maxMinutes: row.max_minutes,
    notes: row.notes,
})

// Weekday first, then kind in the order of SESSION_KINDS (the enum order in the database).
export const selectSlots = Effect.fn('selectSlots')(function* (
    supabase: SlotsClient,
    userId: string
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .select(COLUMNS)
                .eq('user_id', userId)
                .order('weekday', { ascending: true })
                .order('session_kind', { ascending: true }),
        catch: (cause) =>
            new AvailabilityQueryError({
                cause: String(cause),
                error_hash: ErrorCode.ATHLETE_AVAILABILITY_SELECT,
            }),
    })

    if (error)
        return yield* new AvailabilityQueryError({
            cause: `${error.code}: ${error.message}`,
            error_hash: ErrorCode.ATHLETE_AVAILABILITY_SELECT_ERR,
        })

    const parsed = z.array(slotRowSchema).safeParse(data ?? [])
    if (!parsed.success)
        return yield* new AvailabilityQueryError({
            cause: `Row failed schema validation: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
            error_hash: ErrorCode.ATHLETE_AVAILABILITY_SELECT_PARSE,
        })

    return parsed.data.map(toDTO)
})

export const upsertSlots = Effect.fn('upsertSlots')(function* (
    supabase: SlotsClient,
    userId: string,
    slots: AvailabilitySlotDTO[]
) {
    if (slots.length === 0) return

    const { error } = yield* Effect.tryPromise({
        try: () =>
            supabase.from(TABLE).upsert(
                slots.map((slot) => ({
                    user_id: userId,
                    weekday: slot.weekday,
                    session_kind: slot.sessionKind,
                    is_fixed: slot.isFixed,
                    max_minutes: slot.maxMinutes,
                    notes: slot.notes,
                })),
                { onConflict: 'user_id,weekday,session_kind' }
            ),
        catch: (cause) =>
            new AvailabilityQueryError({
                cause: String(cause),
                error_hash: ErrorCode.ATHLETE_AVAILABILITY_UPSERT,
            }),
    })

    if (error)
        return yield* new AvailabilityQueryError({
            cause: `${error.code}: ${error.message}`,
            error_hash: ErrorCode.ATHLETE_AVAILABILITY_UPSERT_ERR,
        })
})

const stalePairSchema = z.array(
    z.object({ weekday: z.number().int(), session_kind: z.enum(SESSION_KINDS) })
)

// PostgREST has no tuple NOT IN, so the user's current pairs are read, the stale ones are
// computed here and removed with one delete per weekday (weekday = d AND kind IN (...)).
// Every query carries the user_id filter, so another user's rows are never touched.
export const deleteSlotsExcept = Effect.fn('deleteSlotsExcept')(function* (
    supabase: SlotsClient,
    userId: string,
    keep: Array<{ weekday: number; sessionKind: string }>
) {
    if (keep.length === 0) {
        const { error } = yield* Effect.tryPromise({
            try: () => supabase.from(TABLE).delete().eq('user_id', userId),
            catch: (cause) =>
                new AvailabilityQueryError({
                    cause: String(cause),
                    error_hash: ErrorCode.ATHLETE_AVAILABILITY_DELETE,
                }),
        })
        if (error)
            return yield* new AvailabilityQueryError({
                cause: `${error.code}: ${error.message}`,
                error_hash: ErrorCode.ATHLETE_AVAILABILITY_DELETE_ERR,
            })
        return
    }

    const { data, error: selectError } = yield* Effect.tryPromise({
        try: () => supabase.from(TABLE).select('weekday, session_kind').eq('user_id', userId),
        catch: (cause) =>
            new AvailabilityQueryError({
                cause: String(cause),
                error_hash: ErrorCode.ATHLETE_AVAILABILITY_STALE_SELECT,
            }),
    })
    if (selectError)
        return yield* new AvailabilityQueryError({
            cause: `${selectError.code}: ${selectError.message}`,
            error_hash: ErrorCode.ATHLETE_AVAILABILITY_STALE_SELECT_ERR,
        })
    const parsed = stalePairSchema.safeParse(data ?? [])
    if (!parsed.success)
        return yield* new AvailabilityQueryError({
            cause: `Row failed schema validation: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
            error_hash: ErrorCode.ATHLETE_AVAILABILITY_STALE_SELECT_PARSE,
        })

    const kept = new Set(keep.map((pair) => `${pair.weekday}:${pair.sessionKind}`))
    const staleByWeekday = new Map<number, string[]>()
    for (const row of parsed.data) {
        if (kept.has(`${row.weekday}:${row.session_kind}`)) continue
        staleByWeekday.set(row.weekday, [
            ...(staleByWeekday.get(row.weekday) ?? []),
            row.session_kind,
        ])
    }

    for (const [weekday, kinds] of staleByWeekday) {
        const { error } = yield* Effect.tryPromise({
            try: () =>
                supabase
                    .from(TABLE)
                    .delete()
                    .eq('user_id', userId)
                    .eq('weekday', weekday)
                    .in('session_kind', kinds),
            catch: (cause) =>
                new AvailabilityQueryError({
                    cause: String(cause),
                    error_hash: ErrorCode.ATHLETE_AVAILABILITY_DELETE,
                }),
        })
        if (error)
            return yield* new AvailabilityQueryError({
                cause: `${error.code}: ${error.message}`,
                error_hash: ErrorCode.ATHLETE_AVAILABILITY_DELETE_ERR,
            })
    }
})
