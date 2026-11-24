import 'server-only'

import { type NextRequest, NextResponse } from 'next/server'
import { createDBServerClient } from '@/_bff/core/db'
import { hasRoxcoachAccess, isRoxcoachAdmin } from '@/_bff/core/helpers/access.helper'
import { decideAuthRedirect } from '@/_bff/core/helpers/auth-redirect.helper'

/**
 * Supabase auth proxy for Next.js.
 * Refreshes the user session via `getClaims()` and syncs auth cookies
 * between the incoming request and outgoing response.
 * A session without `app_metadata.roxcoach === true` counts as signed out on protected paths
 * (the Supabase project is shared with another app), and one without
 * `app_metadata.roxcoach_admin === true` is sent away from admin paths. The decision is
 * `decideAuthRedirect`.
 * @param request - The incoming Next.js proxy request.
 */
export async function sbProxy(request: NextRequest): Promise<NextResponse> {
    let supabaseResponse = NextResponse.next({
        request,
    })
    let refreshHeaders: Record<string, string> = {}

    // With Fluid compute, don't put this client in a global environment
    // variable. Always create a new one on each request.
    const supabase = await createDBServerClient(false, {
        onSetAll(cookiesToSet, headers) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({
                request,
            })
            cookiesToSet.forEach(({ name, value, options }) =>
                supabaseResponse.cookies.set(name, value, options)
            )
            // No-cache headers from Supabase so a response carrying a session cookie is never cached.
            refreshHeaders = headers
            Object.entries(headers).forEach(([key, value]) =>
                supabaseResponse.headers.set(key, value)
            )
        },
    })

    // Do not run code between createServerClient and
    // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
    // issues with users being randomly logged out.
    // IMPORTANT: If you remove getClaims() and you use server-side rendering
    // with the Supabase client, your users may be randomly logged out.
    const { data } = await supabase.auth.getClaims()

    const target = decideAuthRedirect({
        pathname: request.nextUrl.pathname,
        hasAccess: hasRoxcoachAccess(data?.claims),
        isAdmin: isRoxcoachAdmin(data?.claims),
    })

    if (target) {
        const url = request.nextUrl.clone()
        url.pathname = target
        url.search = ''
        url.hash = ''
        const redirect = NextResponse.redirect(url)
        // Keep refreshed session cookies on the redirect, otherwise the browser keeps a rotated
        // refresh token and the user is logged out on the next request.
        supabaseResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
        Object.entries(refreshHeaders).forEach(([key, value]) => redirect.headers.set(key, value))
        return redirect
    }

    // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
    // creating a new response object with NextResponse.next() make sure to:
    // 1. Pass the request in it, like so:
    //    const myNewResponse = NextResponse.next({ request })
    // 2. Copy over the cookies, like so:
    //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
    // 3. Change the myNewResponse object to fit your needs, but avoid changing
    //    the cookies!
    // 4. Finally:
    //    return myNewResponse
    // If this is not done, you may be causing the browser and server to go out
    // of sync and terminate the user's session prematurely!
    return supabaseResponse
}
