import { Effect, type Exit } from 'effect'
import type { User } from '@supabase/supabase-js'
import { getSession } from '@/_bff/modules/auth/services/get-session.service'

type SessionExit = Exit.Exit<User | null, unknown>

export type Context = { session?: () => Promise<SessionExit> }

/**
 * Creates the context for an incoming request. `session` resolves the user once per context:
 * React `cache()` does not dedupe in Route Handlers, so without it each procedure of a batched
 * `/api/trpc` request would make its own Supabase Auth call.
 * @see https://trpc.io/docs/v11/context
 */
export const createContext = async (): Promise<Context> => {
    let session: Promise<SessionExit> | undefined

    return { session: () => (session ??= Effect.runPromiseExit(getSession())) }
}
