import { Decoder, Stream } from '@garmin/fitsdk'
import { Effect } from 'effect'
import { ActivityFileParseError } from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'
import type { ActivityCategory, ParsedActivity, ParsedLap } from '@/_bff/modules/training/types'

// The SDK returns decoded values: Date timestamps, seconds, meters, enum names as strings.
type Maybe<T> = T | null | undefined
type FitMessage = {
    timestamp?: Maybe<Date>
    startTime?: Maybe<Date>
    sport?: Maybe<string>
    subSport?: Maybe<string>
    totalElapsedTime?: Maybe<number>
    totalTimerTime?: Maybe<number>
    totalDistance?: Maybe<number>
    totalAscent?: Maybe<number>
    totalCalories?: Maybe<number>
    avgHeartRate?: Maybe<number>
    maxHeartRate?: Maybe<number>
    avgSpeed?: Maybe<number>
    enhancedAvgSpeed?: Maybe<number>
    heartRate?: Maybe<number>
}
type FitMessages = {
    sessionMesgs?: FitMessage[]
    lapMesgs?: FitMessage[]
    recordMesgs?: FitMessage[]
}

const num = (v: Maybe<number>): number | null =>
    v !== null && v !== undefined && Number.isFinite(v) ? v : null
const int = (v: Maybe<number>): number | null => {
    const n = num(v)
    return n === null ? null : Math.round(n)
}
const iso = (v: Maybe<Date>): string | null =>
    v instanceof Date && !Number.isNaN(v.getTime()) ? v.toISOString() : null
const str = (v: Maybe<string>): string | null => (v ? v : null)

// Pure mapping from FIT sport and sub_sport to the app category.
export function categoryFromSport(
    sport: string | null,
    subSport?: string | null
): ActivityCategory {
    if (sport === 'running') return 'run'
    if (sport === 'cross_training') return 'cross'
    if (sport === 'training' && subSport === 'strength_training') return 'strength'
    return 'other'
}

function parseLap(lap: FitMessage, index: number): ParsedLap | null {
    const startedAt = iso(lap.startTime)
    if (!startedAt) return null
    return {
        lapIndex: index,
        name: null,
        startedAt,
        elapsedTimeS: int(lap.totalElapsedTime),
        movingTimeS: int(lap.totalTimerTime),
        distanceM: num(lap.totalDistance),
        avgHr: int(lap.avgHeartRate),
        avgSpeedMps: num(lap.enhancedAvgSpeed) ?? num(lap.avgSpeed),
        calories: int(lap.totalCalories),
    }
}

function fromRecords(records: FitMessage[]) {
    const times = records.flatMap((r) => iso(r.timestamp) ?? [])
    const hrs = records.flatMap((r) => num(r.heartRate) ?? [])
    const first = times[0]
    const last = times.at(-1)
    if (first === undefined || last === undefined) return null
    const elapsed = Math.round((Date.parse(last) - Date.parse(first)) / 1000)
    return {
        startedAt: first,
        elapsedTimeS: elapsed,
        avgHr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
        maxHr: hrs.length ? Math.max(...hrs) : null,
    }
}

function build(messages: FitMessages): ParsedActivity | null {
    const session = messages.sessionMesgs?.[0]
    const records = messages.recordMesgs ?? []
    const laps = (messages.lapMesgs ?? []).flatMap((lap, i) => parseLap(lap, i) ?? [])
    const sport = str(session?.sport)
    const subSport = str(session?.subSport)
    const base = {
        format: 'fit' as const,
        sportType: sport,
        category: categoryFromSport(sport, subSport),
        name: sport ?? 'Activity',
        elevationGainM: num(session?.totalAscent),
        noteText: null,
        laps,
    }
    const sessionStart = iso(session?.startTime)
    if (session && sessionStart) {
        return {
            ...base,
            startedAt: sessionStart,
            distanceM: num(session.totalDistance),
            movingTimeS: int(session.totalTimerTime),
            elapsedTimeS: int(session.totalElapsedTime),
            avgHr: int(session.avgHeartRate),
            maxHr: int(session.maxHeartRate),
            avgSpeedMps: num(session.enhancedAvgSpeed) ?? num(session.avgSpeed),
            calories: int(session.totalCalories),
        }
    }
    const derived = fromRecords(records)
    if (!derived) return null
    return {
        ...base,
        startedAt: derived.startedAt,
        distanceM: null,
        movingTimeS: derived.elapsedTimeS,
        elapsedTimeS: derived.elapsedTimeS,
        avgHr: derived.avgHr,
        maxHr: derived.maxHr,
        avgSpeedMps: null,
        calories: null,
    }
}

export function parseFit(bytes: Uint8Array) {
    return Effect.try({
        try: () => {
            const decoder = new Decoder(Stream.fromByteArray(Array.from(bytes)))
            if (!decoder.isFIT() || !decoder.checkIntegrity()) throw new Error('invalid fit')
            const { messages, errors } = decoder.read()
            if (errors.length > 0) throw new Error('fit decode errors')
            // SAFETY: the SDK message shapes are a superset of FitMessages, every field is read null-safely.
            const activity = build(messages as FitMessages)
            if (!activity) throw new Error('empty fit')
            return activity
        },
        catch: (cause) =>
            new ActivityFileParseError({
                cause: cause instanceof Error ? cause.name : 'unknown',
                error_hash: ErrorCode.TRAINING_FILE_PARSE,
            }),
    })
}
