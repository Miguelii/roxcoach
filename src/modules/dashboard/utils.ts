import { addDays } from '@/_bff/core/utils/week-dates.utils'

// The calendar window behind the week strip and the run progress (the last five weeks). The
// server prefetch uses it too, so every caller builds the same query key.
export const weekStripWindow = (today: string) => ({ from: addDays(today, -34), to: today })
