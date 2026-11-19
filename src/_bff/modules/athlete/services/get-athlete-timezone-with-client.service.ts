import 'server-only'

import { selectTimezone } from '@/_bff/modules/athlete/repositories/athlete-profiles.repository'

// For callers that already hold a client (the Strava sync runs with the service-role client and
// no session): other modules reach the athlete profile through this service, never its repository.
export const getAthleteTimezoneWithClient = (
    supabase: Parameters<typeof selectTimezone>[0],
    userId: string
) => selectTimezone(supabase, userId)
