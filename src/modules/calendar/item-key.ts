import type { CalendarItem } from '@/modules/mock/types'

/** Stable React key for a calendar entry. */
export const getItemKey = (item: CalendarItem) => {
    switch (item.type) {
        case 'race':
            return `race-${item.race.id}`
        case 'activity':
            return `activity-${item.activity.id}`
        case 'planned':
            return `planned-${item.session.id}`
    }
}
