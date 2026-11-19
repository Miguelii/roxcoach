import { z } from 'zod'

// user_metadata is accepted (a Supabase user and its claims carry it) but never read: the user can
// write it themselves.
type AccessSubject = { app_metadata?: unknown; user_metadata?: unknown }

// The Supabase project is shared with another app, so being signed in is not enough:
// access requires the strict boolean `app_metadata.roxcoach === true`.
const AccessSchema = z.object({ app_metadata: z.object({ roxcoach: z.literal(true) }) })

export const hasRoxcoachAccess = (subject: AccessSubject | null | undefined): boolean =>
    AccessSchema.safeParse(subject).success
