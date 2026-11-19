import type { CalendarItem } from '@/_bff/modules/training/types'

/** Stable React key for a calendar entry. */
export const getItemKey = (item: CalendarItem) => `activity-${item.activity.id}`
