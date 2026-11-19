import { Cause, Exit, Option } from 'effect'
import type { createDBAdminClient } from '@/_bff/core/db'

// Extracts the tagged failure of an Exit, or null when the effect succeeded.
export const failureTag = <E>(exit: Exit.Exit<unknown, E>): string | null => {
    if (!Exit.isFailure(exit)) return null
    const failure = Cause.findErrorOption(exit.cause)
    // SAFETY: every failure in this codebase is a Data.TaggedError, so it carries a string `_tag`.
    return Option.isSome(failure) ? (failure.value as { _tag: string })._tag : null
}

// The value of a successful Exit, or null when the effect failed.
export const successValue = <A>(exit: Exit.Exit<A, unknown>): A | null =>
    Exit.isSuccess(exit) ? exit.value : null

// Wraps a fake query chain (or a whole fake client) into the Supabase client type repositories take.
export const asClient = <Fake extends { from: (table: string) => object }>(
    fake: Fake
): ReturnType<typeof createDBAdminClient> =>
    // SAFETY: tests only exercise the subset of the client API the fake implements.
    fake as never
