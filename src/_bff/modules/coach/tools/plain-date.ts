import { z } from 'zod'
import { formatIsoDate, parseIsoDate } from '@/_bff/core/utils/week-dates.utils'

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/u

// A real calendar date in plain YYYY-MM-DD form (2026-02-30 is rejected).
export const plainDate = z
    .string()
    .refine((value) => PLAIN_DATE.test(value) && formatIsoDate(parseIsoDate(value)) === value, {
        message: 'must be a valid YYYY-MM-DD date',
    })
