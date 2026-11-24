import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { getProfile } from '@/_bff/modules/athlete/services/get-profile.service'
import type { ProfileViewDTO } from '@/_bff/modules/athlete/types'

// The email comes from the auth user (getUser()), not from athlete_profiles.
export const getProfileView = Effect.fn('getProfileView')(function* (user: User) {
    const profile = yield* getProfile(user)
    const view: ProfileViewDTO = { ...profile, email: user.email ?? null }
    return view
})
