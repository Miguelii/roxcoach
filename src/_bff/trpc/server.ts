import { initTRPC, TRPCError } from '@trpc/server'
import { Effect, Exit } from 'effect'
import { hasRoxcoachAccess, isRoxcoachAdmin } from '@/_bff/core/helpers/access.helper'
import { Logger } from '@/_bff/lib/server-logger'
import { getSession } from '@/_bff/modules/auth/services/get-session.service'
import type { Context } from '@/_bff/trpc/context'

const t = initTRPC.context<Context>().create()

/**
 * Unprotected procedure
 **/
export const publicProcedure = t.procedure

/**
 * Resolves the session once per request (memoized in the context) and injects the authenticated `user` into ctx.
 * Infrastructure failures map to 500, a missing user to 401. The Supabase project is shared with
 * another app, so a signed-in user without `app_metadata.roxcoach === true` maps to 403.
 * Protected services receive `ctx.user` and keep creating their own Supabase client for queries so
 * each one stays in control of which key (publishable vs service-role) it uses.
 **/
const isAuthed = t.middleware(async ({ ctx, next }) => {
    const session = await (ctx.session?.() ?? Effect.runPromiseExit(getSession()))

    if (Exit.isFailure(session)) {
        Logger({ level: 'error', prefix: 'protectedProcedure', error: session.cause })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
    }

    const user = session.value

    if (!user) {
        throw new TRPCError({ code: 'UNAUTHORIZED' })
    }

    if (!hasRoxcoachAccess(user)) {
        throw new TRPCError({ code: 'FORBIDDEN' })
    }

    return next({ ctx: { user } })
})

/**
 * Protected procedure: guarantees a non-null authenticated `ctx.user` with roxcoach access.
 **/
export const protectedProcedure = t.procedure.use(isAuthed)

/**
 * Admin procedure: a protected procedure whose `ctx.user` also carries
 * `app_metadata.roxcoach_admin === true`, otherwise 403. `ctx.user` comes from `getUser()`, so a
 * revoked admin flag is refused at once, unlike the proxy, which reads the JWT claims.
 **/
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
    if (!isRoxcoachAdmin(ctx.user)) {
        throw new TRPCError({ code: 'FORBIDDEN' })
    }

    return next()
})

export const router = t.router
