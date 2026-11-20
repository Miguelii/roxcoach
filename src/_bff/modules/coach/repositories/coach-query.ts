import 'server-only'

import { Effect } from 'effect'
import { z } from 'zod'
import type { createDBAdminClient, createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CoachQueryError, CoachWriteError } from '@/_bff/lib/errors'

export type CoachClient =
    | ReturnType<typeof createDBAdminClient>
    | Awaited<ReturnType<typeof createDBServerClient>>

type QueryOutcome = { data: unknown; error: { code: string; message: string } | null }

export type Codes = { call: ErrorCode; returned: ErrorCode; parse: ErrorCode }

type Build<Failure> = (cause: string, error_hash: ErrorCode) => Failure

// Runs one query, turns thrown and returned failures into a tagged error and parses the data with
// `schema` at the boundary. Error causes never carry row data.
const makeRunner =
    <Failure>(build: Build<Failure>) =>
    <Schema extends z.ZodType>(
        query: () => PromiseLike<QueryOutcome>,
        codes: Codes,
        schema: Schema
    ) =>
        Effect.gen(function* () {
            const { data, error } = yield* Effect.tryPromise({
                try: query,
                catch: (cause) => build(String(cause), codes.call),
            })
            if (error)
                return yield* Effect.fail(build(`${error.code}: ${error.message}`, codes.returned))
            const parsed = schema.safeParse(data)
            if (!parsed.success)
                return yield* Effect.fail(
                    build(
                        `Row failed schema validation: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
                        codes.parse
                    )
                )
            // SAFETY: `parsed.data` was just produced by `schema`, so it is `z.infer<Schema>`.
            return parsed.data as z.infer<Schema>
        })

// Reads fail with CoachQueryError.
export const runCoachRead = makeRunner(
    (cause, error_hash) => new CoachQueryError({ cause, error_hash })
)

// Writes fail with CoachWriteError.
export const runCoachWrite = makeRunner(
    (cause, error_hash) => new CoachWriteError({ cause, error_hash })
)

export const idList = z.preprocess((value) => value ?? [], z.array(z.object({ id: z.string() })))
