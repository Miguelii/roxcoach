import { Match } from 'effect'
import type { CalendarItem } from '@/_bff/modules/training/types'

/** Stable React key for a calendar entry; the type prefix keeps an activity and a race with the same id apart. */
export const getItemKey = (item: CalendarItem) =>
    Match.value(item).pipe(
        Match.when({ type: 'activity' }, ({ activity }) => `activity-${activity.id}`),
        Match.when({ type: 'race' }, ({ race }) => `race-${race.id}`),
        Match.exhaustive
    )
