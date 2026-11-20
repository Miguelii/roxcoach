import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { isStepCount, streamText, tool } from 'ai'
import { z } from 'zod'
import type {
    CoachModel,
    CoachModelRequest,
    CoachStreamEvent,
} from '@/_bff/modules/coach/providers/coach-model'
import type { CoachTool } from '@/_bff/modules/coach/types'

type Options = { apiKey: string; modelId: string; generate?: typeof streamText }

type ErrorKind = Extract<CoachStreamEvent, { type: 'error' }>['kind']

const MAX_CAUSE_DEPTH = 4

// The provider errors expose their HTTP status as `statusCode`, and retry wrappers nest the real
// failure under `lastError` or `cause`.
const ProviderErrorSchema = z.looseObject({
    statusCode: z.number().optional(),
    lastError: z.unknown().optional(),
    cause: z.unknown().optional(),
})

// Reads the status from the error or its nested failures. Never reads the message text.
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- parsed by ProviderErrorSchema right below
const findStatusCode = (error: unknown, depth = 0): number | null => {
    const parsed = ProviderErrorSchema.safeParse(error)
    if (!parsed.success || depth > MAX_CAUSE_DEPTH) return null
    const { statusCode, lastError, cause } = parsed.data

    return statusCode ?? findStatusCode(lastError, depth + 1) ?? findStatusCode(cause, depth + 1)
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- only the status code is read from it
const toErrorKind = (error: unknown): ErrorKind =>
    findStatusCode(error) === 429 ? 'rate_limited' : 'unavailable'

const toTools = (tools: CoachTool[]) =>
    Object.fromEntries(
        tools.map((coachTool) => [
            coachTool.name,
            tool({
                description: coachTool.description,
                inputSchema: coachTool.inputSchema,
                // oxlint-disable-next-line anti-slop/no-unknown-parameters -- validated by the tool's zod schema
                execute: (input: unknown) => coachTool.execute(input),
            }),
        ])
    )

const toCount = (value: number | undefined): number | null => value ?? null

export const createGeminiCoachModel = ({
    apiKey,
    modelId,
    generate = streamText,
}: Options): CoachModel => {
    const google = createGoogleGenerativeAI({ apiKey })

    async function* stream(request: CoachModelRequest): AsyncGenerator<CoachStreamEvent> {
        const { system, messages, tools, maxSteps, signal } = request

        try {
            const result = generate({
                model: google(modelId),
                instructions: system,
                messages,
                tools: toTools(tools),
                stopWhen: isStepCount(maxSteps),
                abortSignal: signal,
                // The fallback list is the retry policy: no automatic retries, and no thinking
                // level or thinking provider option (Gemini 3.8 Flash rejects `minimal`).
                maxRetries: 0,
                // The SDK default logs the whole error, whose fields carry the request body (system
                // prompt, athlete context, history). The failure arrives as an `error` part instead.
                onError: () => undefined,
            })

            for await (const part of result.fullStream) {
                if (signal.aborted) return

                if (part.type === 'text-delta') {
                    yield { type: 'text', delta: part.text }
                } else if (part.type === 'error') {
                    yield { type: 'error', kind: toErrorKind(part.error) }
                    return
                } else if (part.type === 'abort') {
                    return
                } else if (part.type === 'finish') {
                    if (part.finishReason === 'content-filter') {
                        yield { type: 'error', kind: 'blocked' }
                    } else if (part.finishReason === 'error') {
                        yield { type: 'error', kind: 'unavailable' }
                    } else {
                        yield {
                            type: 'done',
                            usage: {
                                promptTokens: toCount(part.totalUsage?.inputTokens),
                                completionTokens: toCount(part.totalUsage?.outputTokens),
                            },
                        }
                    }
                    return
                }
            }
        } catch (error) {
            if (signal.aborted) return
            yield { type: 'error', kind: toErrorKind(error) }
        }
    }

    return { modelId, stream }
}
