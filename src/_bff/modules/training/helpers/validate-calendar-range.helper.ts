import { Effect } from 'effect'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { InvalidDateRangeError } from '@/_bff/lib/errors'

export type DateRange = { from: string; to: string }

const MAX_RANGE_DAYS = 100
const MS_PER_DAY = 86_400_000
const PLAIN_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u

// Whole days since the epoch of a plain YYYY-MM-DD date, or null when it is not one. Date.UTC takes
// the parts directly, so no timezone or DST shift can move the day.
const toDayNumber = (date: string): number | null => {
    const match = PLAIN_DATE.exec(date)
    if (match === null) return null
    const [, year, month, day] = match
    return Math.round(Date.UTC(Number(year), Number(month) - 1, Number(day)) / MS_PER_DAY)
}

export const validateRange = Effect.fn('validateRange')(function* (range: DateRange) {
    const from = toDayNumber(range.from)
    const to = toDayNumber(range.to)

    if (from === null || to === null || from > to)
        return yield* new InvalidDateRangeError({
            cause: 'range must be two YYYY-MM-DD dates with from <= to',
            error_hash: ErrorCode.TRAINING_RANGE_INVALID,
        })

    if (to - from > MAX_RANGE_DAYS)
        return yield* new InvalidDateRangeError({
            cause: `range spans more than ${MAX_RANGE_DAYS} days`,
            error_hash: ErrorCode.TRAINING_RANGE_TOO_LONG,
        })
})
