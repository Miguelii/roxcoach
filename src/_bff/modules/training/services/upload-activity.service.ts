import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { createDBServerClient } from '@/_bff/core/db'
import { localDateIn } from '@/_bff/core/utils/date.utils'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    ActivityFileTooLargeError,
    CreateSbClientError,
    DuplicateActivityFileError,
    type ProfileQueryError,
} from '@/_bff/lib/errors'
import { getAthleteTimezone } from '@/_bff/modules/athlete/services/get-athlete-timezone.service'
import { labelHyroxLaps } from '@/_bff/modules/training/helpers/label-hyrox-laps.helper'
import { parseActivityFile } from '@/_bff/modules/training/helpers/parse-activity-file.helper'
import {
    deleteActivity,
    insertActivity,
    selectIdByStartedAt,
} from '@/_bff/modules/training/repositories/activities.repository'
import { replaceLaps } from '@/_bff/modules/training/repositories/activity-laps.repository'
import {
    insertActivityFile,
    selectFileIdBySha256,
} from '@/_bff/modules/training/repositories/activity-files.repository'
import {
    putActivityFile,
    removeActivityFile,
} from '@/_bff/modules/training/repositories/activity-files-storage.repository'
import type {
    LapRow,
    ParsedActivity,
    StorageClient,
    TrainingClient,
} from '@/_bff/modules/training/types'

type UploadInput = { bytes: Uint8Array; originalName: string; isHyrox: boolean }

type UploadClient = { supabase: TrainingClient; storage: StorageClient }

type UploadDeps = {
    getTimezone: (user: User) => Effect.Effect<string, ProfileQueryError | CreateSbClientError>
    createClient: () => Effect.Effect<UploadClient, CreateSbClientError>
}

const MAX_FILE_BYTES = 10 * 1024 * 1024

const defaultDeps: UploadDeps = {
    getTimezone: getAthleteTimezone,
    createClient: () =>
        Effect.tryPromise({
            try: async () => {
                const client = await createDBServerClient()
                return { supabase: client, storage: client }
            },
            catch: (cause) =>
                new CreateSbClientError({ cause, error_hash: ErrorCode.TRAINING_SB_CLIENT }),
        }),
}

const duplicate = () =>
    new DuplicateActivityFileError({
        cause: 'the file or its activity already exists',
        error_hash: ErrorCode.TRAINING_FILE_DUPLICATE,
    })

const sha256Hex = (bytes: Uint8Array) =>
    Effect.promise(async () => {
        const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
        return Array.from(new Uint8Array(digest), (byte) =>
            byte.toString(16).padStart(2, '0')
        ).join('')
    })

const toLapRows = (parsed: ParsedActivity, isHyrox: boolean): LapRow[] => {
    const stations = isHyrox ? labelHyroxLaps(parsed.laps) : null
    return parsed.laps.map((lap, index) => ({
        lap_index: lap.lapIndex,
        name: lap.name,
        distance_m: lap.distanceM,
        elapsed_time_s: lap.elapsedTimeS,
        moving_time_s: lap.movingTimeS,
        avg_hr: lap.avgHr,
        avg_speed_mps: lap.avgSpeedMps,
        station: stations?.[index] ?? null,
    }))
}

// Checks, parses and stores one activity file as the signed-in user (publishable key). The object
// is written first; any later failure removes it and the activity, without masking the original error.
export const uploadActivity = Effect.fn('uploadActivity')(function* (
    user: User,
    input: UploadInput,
    deps: UploadDeps = defaultDeps
) {
    if (input.bytes.byteLength > MAX_FILE_BYTES)
        return yield* new ActivityFileTooLargeError({
            cause: `file is larger than ${MAX_FILE_BYTES} bytes`,
            error_hash: ErrorCode.TRAINING_FILE_TOO_LARGE,
        })

    const parsed = yield* parseActivityFile(input.bytes)
    const sha256 = yield* sha256Hex(input.bytes)
    const { supabase, storage } = yield* deps.createClient()

    if ((yield* selectFileIdBySha256(supabase, user.id, sha256)) !== null) return yield* duplicate()
    if ((yield* selectIdByStartedAt(supabase, user.id, parsed.startedAt)) !== null)
        return yield* duplicate()

    const timezone = yield* deps.getTimezone(user)
    const laps = toLapRows(parsed, input.isHyrox)
    const isLabelled = laps.some((lap) => lap.station !== null)

    const fileId = crypto.randomUUID()
    const storagePath = `${user.id}/${fileId}.${parsed.format}`

    yield* putActivityFile(storage, storagePath, input.bytes, 'application/octet-stream')

    return yield* Effect.gen(function* () {
        const activityId = yield* insertActivity(supabase, user.id, {
            sport_type: parsed.sportType,
            category: isLabelled ? 'hyrox' : parsed.category,
            name: parsed.name,
            started_at: parsed.startedAt,
            local_date: localDateIn(parsed.startedAt, timezone),
            distance_m: parsed.distanceM,
            moving_time_s: parsed.movingTimeS,
            elapsed_time_s: parsed.elapsedTimeS,
            elevation_gain_m: parsed.elevationGainM,
            avg_hr: parsed.avgHr,
            max_hr: parsed.maxHr,
            avg_speed_mps: parsed.avgSpeedMps,
            calories: parsed.calories,
            hr_histogram: parsed.hrHistogram,
            pace_histogram: parsed.paceHistogram,
        })

        yield* Effect.gen(function* () {
            yield* replaceLaps(supabase, user.id, activityId, laps)
            yield* insertActivityFile(supabase, user.id, {
                id: fileId,
                activity_id: activityId,
                format: parsed.format,
                storage_path: storagePath,
                sha256,
                size_bytes: input.bytes.byteLength,
                original_name: input.originalName,
                status: 'parsed',
                error_code: null,
            })
        }).pipe(
            Effect.onError(() => deleteActivity(supabase, user.id, activityId).pipe(Effect.ignore))
        )

        return { activityId }
    }).pipe(Effect.onError(() => removeActivityFile(storage, storagePath).pipe(Effect.ignore)))
})
