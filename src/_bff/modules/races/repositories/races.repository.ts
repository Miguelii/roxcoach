import 'server-only'

import { Effect } from 'effect'
import { z } from 'zod'
import { HYROX_DIVISION_KEYS } from '@/_bff/core/constants/hyrox.constants'
import type { createDBAdminClient, createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { RaceQueryError } from '@/_bff/lib/errors'
import type { RaceDTO, RaceFilter, RaceInput, RaceStatus } from '@/_bff/modules/races/types'

type RacesClient =
    | ReturnType<typeof createDBAdminClient>
    | Awaited<ReturnType<typeof createDBServerClient>>

type QueryOutcome = { data: unknown; error: { code: string; message: string } | null }

type RaceRow = z.infer<typeof raceRowSchema>

type Codes = { call: ErrorCode; returned: ErrorCode; parse: ErrorCode }

const TABLE = 'races'
const COLUMNS =
    'id, name, race_type, race_date, location, distance_m, hyrox_division, target_time_s, priority, status, result_time_s, notes'

const raceRowSchema = z.object({
    id: z.string(),
    name: z.string(),
    race_type: z.enum(['hyrox', 'running', 'other']),
    race_date: z.string(),
    location: z.string().nullable(),
    distance_m: z.number().int().nullable(),
    hyrox_division: z.enum(HYROX_DIVISION_KEYS).nullable(),
    target_time_s: z.number().int(),
    priority: z.enum(['A', 'B', 'C']),
    status: z.enum(['upcoming', 'completed', 'cancelled']),
    result_time_s: z.number().int().nullable(),
    notes: z.string().nullable(),
})

const SELECT_CODES: Codes = {
    call: ErrorCode.RACES_SELECT,
    returned: ErrorCode.RACES_SELECT_ERR,
    parse: ErrorCode.RACES_SELECT_PARSE,
}
const INSERT_CODES: Codes = {
    call: ErrorCode.RACES_INSERT,
    returned: ErrorCode.RACES_INSERT_ERR,
    parse: ErrorCode.RACES_INSERT_PARSE,
}
const UPDATE_CODES: Codes = {
    call: ErrorCode.RACES_UPDATE,
    returned: ErrorCode.RACES_UPDATE_ERR,
    parse: ErrorCode.RACES_UPDATE_PARSE,
}
const RESULT_CODES: Codes = {
    call: ErrorCode.RACES_RESULT,
    returned: ErrorCode.RACES_RESULT_ERR,
    parse: ErrorCode.RACES_RESULT_PARSE,
}
const STATUS_CODES: Codes = {
    call: ErrorCode.RACES_STATUS,
    returned: ErrorCode.RACES_STATUS_ERR,
    parse: ErrorCode.RACES_STATUS_PARSE,
}
const DELETE_CODES: Codes = {
    call: ErrorCode.RACES_DELETE,
    returned: ErrorCode.RACES_DELETE_ERR,
    parse: ErrorCode.RACES_DELETE_PARSE,
}

const toDTO = (row: RaceRow): RaceDTO => ({
    id: row.id,
    name: row.name,
    raceType: row.race_type,
    raceDate: row.race_date,
    location: row.location,
    distanceM: row.distance_m,
    hyroxDivision: row.hyrox_division,
    targetTimeS: row.target_time_s,
    priority: row.priority,
    status: row.status,
    resultTimeS: row.result_time_s,
    notes: row.notes,
})

// Trims; empty or whitespace-only text is stored as NULL.
const blankToNull = (value: string | null) => {
    const text = value?.trim() ?? ''
    return text === '' ? null : text
}

const toColumns = (input: RaceInput) => ({
    name: input.name.trim(),
    race_type: input.raceType,
    race_date: input.raceDate,
    location: blankToNull(input.location),
    distance_m: input.distanceM,
    hyrox_division: input.hyroxDivision,
    target_time_s: input.targetTimeS,
    priority: input.priority,
    notes: blankToNull(input.notes),
})

// Runs one query, turns thrown and returned failures into RaceQueryError and parses the data
// with `schema` at the boundary.
const run = <Schema extends z.ZodType>(
    query: () => PromiseLike<QueryOutcome>,
    codes: Codes,
    schema: Schema
) =>
    Effect.gen(function* () {
        const { data, error } = yield* Effect.tryPromise({
            try: query,
            catch: (cause) => new RaceQueryError({ cause: String(cause), error_hash: codes.call }),
        })
        if (error)
            return yield* new RaceQueryError({
                cause: `${error.code}: ${error.message}`,
                error_hash: codes.returned,
            })
        const parsed = schema.safeParse(data)
        if (!parsed.success)
            return yield* new RaceQueryError({
                cause: `Row failed schema validation: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
                error_hash: codes.parse,
            })
        // SAFETY: `parsed.data` was just produced by `schema`, so it is `z.infer<Schema>`.
        return parsed.data as z.infer<Schema>
    })

const maybeRow = z.preprocess((value) => value ?? null, raceRowSchema.nullable())
const rowList = z.preprocess((value) => value ?? [], z.array(raceRowSchema))
const idList = z.preprocess((value) => value ?? [], z.array(z.object({ id: z.string() })))

const toMaybeDTO = (row: RaceRow | null): RaceDTO | null => (row === null ? null : toDTO(row))

// Ordered by date then id. Every query carries the user_id filter.
export const selectRaces = Effect.fn('selectRaces')(function* (
    supabase: RacesClient,
    userId: string,
    filter: RaceFilter
) {
    const rows = yield* run(
        () => {
            let query = supabase.from(TABLE).select(COLUMNS).eq('user_id', userId)
            if (filter.status) query = query.in('status', filter.status)
            if (filter.from) query = query.gte('race_date', filter.from)
            if (filter.to) query = query.lte('race_date', filter.to)
            return query.order('race_date', { ascending: true }).order('id', { ascending: true })
        },
        SELECT_CODES,
        rowList
    )
    return rows.map((row) => toDTO(row))
})

// Null when no race with this id belongs to the user.
export const selectRaceById = Effect.fn('selectRaceById')(function* (
    supabase: RacesClient,
    userId: string,
    id: string
) {
    const row = yield* run(
        () => supabase.from(TABLE).select(COLUMNS).eq('id', id).eq('user_id', userId).maybeSingle(),
        SELECT_CODES,
        maybeRow
    )
    return toMaybeDTO(row)
})

export const insertRace = Effect.fn('insertRace')(function* (
    supabase: RacesClient,
    userId: string,
    input: RaceInput
) {
    const row = yield* run(
        () =>
            supabase
                .from(TABLE)
                .insert({ ...toColumns(input), user_id: userId })
                .select(COLUMNS)
                .single(),
        INSERT_CODES,
        raceRowSchema
    )
    return toDTO(row)
})

// Null when no race with this id belongs to the user. Status and result are never touched here.
export const updateRace = Effect.fn('updateRace')(function* (
    supabase: RacesClient,
    userId: string,
    id: string,
    input: RaceInput
) {
    const row = yield* run(
        () =>
            supabase
                .from(TABLE)
                .update(toColumns(input))
                .eq('id', id)
                .eq('user_id', userId)
                .select(COLUMNS)
                .maybeSingle(),
        UPDATE_CODES,
        maybeRow
    )
    return toMaybeDTO(row)
})

// Records the result and completes the race. Null when the race is missing or cancelled.
export const setRaceResult = Effect.fn('setRaceResult')(function* (
    supabase: RacesClient,
    userId: string,
    id: string,
    resultTimeS: number
) {
    const row = yield* run(
        () =>
            supabase
                .from(TABLE)
                .update({ result_time_s: resultTimeS, status: 'completed' })
                .eq('id', id)
                .eq('user_id', userId)
                .neq('status', 'cancelled')
                .select(COLUMNS)
                .maybeSingle(),
        RESULT_CODES,
        maybeRow
    )
    return toMaybeDTO(row)
})

export const setRaceStatus = Effect.fn('setRaceStatus')(function* (
    supabase: RacesClient,
    userId: string,
    id: string,
    status: Extract<RaceStatus, 'cancelled' | 'upcoming'>
) {
    const row = yield* run(
        () =>
            supabase
                .from(TABLE)
                .update({ status })
                .eq('id', id)
                .eq('user_id', userId)
                .neq('status', 'completed')
                .select(COLUMNS)
                .maybeSingle(),
        STATUS_CODES,
        maybeRow
    )
    return toMaybeDTO(row)
})

// Only a race without a result is removed. True when a row was deleted.
export const deleteRace = Effect.fn('deleteRace')(function* (
    supabase: RacesClient,
    userId: string,
    id: string
) {
    const deleted = yield* run(
        () =>
            supabase
                .from(TABLE)
                .delete()
                .eq('id', id)
                .eq('user_id', userId)
                .is('result_time_s', null)
                .select('id'),
        DELETE_CODES,
        idList
    )
    return deleted.length > 0
})
