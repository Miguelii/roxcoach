import 'server-only'

import { cache } from 'react'
import { z } from 'zod'
import { createDBServerClient } from '@/_bff/core/db'
import { hasRoxcoachAccess, isRoxcoachAdmin } from '@/_bff/core/helpers/access.helper'

export type SessionClaims = {
    userId: string
    email: string | null
    fullName: string | null
    hasAccess: boolean
    isAdmin: boolean
}

// JWT claims are user-editable metadata: a missing or malformed field reads as null
const optionalClaim = z.string().nullable().catch(null)

const ClaimsSchema = z.object({
    sub: z.string().min(1),
    email: optionalClaim,
    user_metadata: z.object({ full_name: optionalClaim }).catch({ full_name: null }),
    app_metadata: z.unknown().optional(),
})

/**
 * Current user's identity for rendering UI (navigation, avatar, access-aware shell).
 *
 * Reads the access token via `getClaims()`, which verifies the JWT locally (WebCrypto) with
 * asymmetric signing keys, so there is no `getUser()` network round-trip blocking the render.
 * Wrapped in React `cache()` so it runs at most once per request. Never throws: returns null on
 * any failure or when signed out.
 *
 * UI only. Authorization decisions keep going through `getSession()`.
 */
export const getCachedClaims = cache(async (): Promise<SessionClaims | null> => {
    try {
        const supabase = await createDBServerClient()
        const { data } = await supabase.auth.getClaims()
        const claims = ClaimsSchema.safeParse(data?.claims)

        if (!claims.success) return null

        return {
            userId: claims.data.sub,
            email: claims.data.email,
            fullName: claims.data.user_metadata.full_name,
            hasAccess: hasRoxcoachAccess({ app_metadata: claims.data.app_metadata }),
            isAdmin: isRoxcoachAdmin({ app_metadata: claims.data.app_metadata }),
        }
    } catch {
        return null
    }
})
