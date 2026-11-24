import { z } from 'zod'

// user_metadata is accepted (a Supabase user and its claims carry it) but never read: the user can
// write it themselves.
type AccessSubject = { app_metadata?: unknown; user_metadata?: unknown }

// The Supabase project is shared with another app, so being signed in is not enough:
// access requires the strict boolean `app_metadata.roxcoach === true`.
const AccessSchema = z.object({ app_metadata: z.object({ roxcoach: z.literal(true) }) })

// Admin pages (logs) also require the strict boolean `app_metadata.roxcoach_admin === true`.
// Only the service role can write app_metadata, so a user cannot make themselves an admin.
const AdminSchema = z.object({
    app_metadata: z.object({ roxcoach: z.literal(true), roxcoach_admin: z.literal(true) }),
})

export const hasRoxcoachAccess = (subject: AccessSubject | null | undefined): boolean =>
    AccessSchema.safeParse(subject).success

export const isRoxcoachAdmin = (subject: AccessSubject | null | undefined): boolean =>
    AdminSchema.safeParse(subject).success
