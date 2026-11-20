import { z } from 'zod'
import { Logger } from '@/_bff/lib/server-logger'
import type { ToolResult } from '@/_bff/modules/coach/types'

type ToolError = { error: string }

const FailureSchema = z.looseObject({
    _tag: z.string().optional(),
    error_hash: z.string().optional(),
})

// Only the tag and hash are read from a failure: never its message or cause.
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- parsed by FailureSchema right below
const describeFailure = (error: unknown) => {
    const parsed = FailureSchema.safeParse(error)

    return {
        tag: parsed.success ? (parsed.data._tag ?? 'unknown') : 'unknown',
        errorHash: parsed.success ? (parsed.data.error_hash ?? null) : null,
    }
}

const READ_FAILED: ToolError = { error: 'could not read data' }

/**
 * Validates the model's input and runs the handler. Invalid input and failing services become short
 * error results: the raw input and the failure cause are never echoed back to the model.
 */
export const runTool = async <S extends z.ZodType>(
    schema: S,
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- validated by the schema right below
    input: unknown,
    handler: (data: z.infer<S>) => Promise<ToolResult>
): Promise<ToolResult> => {
    const parsed = schema.safeParse(input)
    if (!parsed.success) {
        const issue = parsed.error.issues[0]
        const field = issue?.path.join('.')
        const reason = issue?.message ?? 'bad format'

        return { error: `invalid input: ${field ? `${field}: ` : ''}${reason}` }
    }

    try {
        return await handler(parsed.data)
    } catch (error) {
        // Only the failure tag and hash are logged: never the cause, message or input
        Logger({
            level: 'error',
            prefix: 'coach-tool',
            message: 'tool failed',
            metadata: describeFailure(error),
        })

        return READ_FAILED
    }
}
