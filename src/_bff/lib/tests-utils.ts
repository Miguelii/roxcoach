import { Cause, Exit, Option } from 'effect'

// Extracts the tagged failure of an Exit, or null when the effect succeeded.
export const failureTag = <E>(exit: Exit.Exit<unknown, E>): string | null => {
    if (!Exit.isFailure(exit)) return null
    const failure = Cause.findErrorOption(exit.cause)
    // SAFETY: every failure in this codebase is a Data.TaggedError, so it carries a string `_tag`.
    return Option.isSome(failure) ? (failure.value as { _tag: string })._tag : null
}
