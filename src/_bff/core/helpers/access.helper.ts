import { z } from 'zod'

type AccessSubject = { app_metadata?: unknown }

// The Supabase project is shared with another app, so being signed in is not enough:
// access requires the strict boolean `app_metadata.roxcoach === true`.
const AccessSchema = z.object({ app_metadata: z.object({ roxcoach: z.literal(true) }) })

export const hasRoxcoachAccess = (subject: AccessSubject | null | undefined): boolean =>
    AccessSchema.safeParse(subject).success
