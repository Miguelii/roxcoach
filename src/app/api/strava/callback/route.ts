import { type NextRequest, NextResponse } from 'next/server'
import { Effect, Exit } from 'effect'
import { ClientEnv } from '@/env/client'
import { hasRoxcoachAccess } from '@/_bff/core/helpers/access.helper'
import { Logger } from '@/_bff/lib/server-logger'
import { getSession } from '@/_bff/modules/auth/services/get-session.service'
import { STRAVA_STATE_COOKIE } from '@/_bff/modules/strava/constants'
import { stateCookieOptions } from '@/_bff/modules/strava/helpers/strava-oauth-state.helper'
import { completeStravaConnect } from '@/_bff/modules/strava/services/complete-strava-connect.service'

type Outcome = 'connected' | 'denied' | 'scope' | 'error'

// Every response clears the single-use state cookie, whatever the outcome. The redirect target is
// a fixed path on the site: never a token, code or error detail.
const redirectTo = (path: string) => {
    const response = NextResponse.redirect(`${ClientEnv.NEXT_PUBLIC_WEBSITE_URL}${path}`)
    response.cookies.set(STRAVA_STATE_COOKIE, '', stateCookieOptions(0))
    return response
}

const settings = (outcome: Outcome) => redirectTo(`/settings?strava=${outcome}`)

// Strava redirects here after the consent screen. The proxy matcher excludes `api/`, so this route
// checks the session itself: `getSession()` asks Supabase Auth through `getUser()` (not the JWT
// claims), and the user must carry `app_metadata.roxcoach === true`. Without both it redirects to
// /login and exchanges nothing. The user id always comes from the session, never the query.
export async function GET(request: NextRequest) {
    const session = await Effect.runPromiseExit(getSession())
    const user = Exit.isSuccess(session) ? session.value : null

    if (Exit.isFailure(session))
        Logger({ level: 'error', prefix: 'stravaCallback', error: session.cause })

    if (!user || !hasRoxcoachAccess(user)) return redirectTo('/login')

    const params = request.nextUrl.searchParams
    const result = await Effect.runPromiseExit(
        completeStravaConnect({
            userId: user.id,
            code: params.get('code'),
            scope: params.get('scope'),
            state: params.get('state'),
            error: params.get('error'),
            stateCookie: request.cookies.get(STRAVA_STATE_COOKIE)?.value ?? null,
        })
    )

    if (Exit.isSuccess(result)) return settings(result.value)

    Logger({ level: 'error', prefix: 'stravaCallback', error: result.cause, userId: user.id })
    return settings('error')
}
