// @vitest-environment node
/* oxlint-disable unicorn/consistent-function-scoping -- test helpers stay next to the cases that use them */
import { AsyncLocalStorage } from 'node:async_hooks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    DONE,
    ME,
    MINE,
    makeStore,
    post,
    readLines,
    setup,
    spyConsole,
} from '@/_bff/modules/coach/helpers/__tests__/chat-handler.fixtures'
import { Effect } from 'effect'
import { createChatHandler } from '@/_bff/modules/coach/helpers/chat-handler.helper'
import { createFallbackCoachModel } from '@/_bff/modules/coach/providers/fallback-coach-model'
import { sendCoachMessage } from '@/_bff/modules/coach/services/send-coach-message.service'
import type { CoachModel } from '@/_bff/modules/coach/providers/coach-model'
import type { ChatEvent } from '@/_bff/modules/coach/services/send-coach-message.service'
import type { CoachTool } from '@/_bff/modules/coach/types'

afterEach(() => vi.restoreAllMocks())

// Next runs the route handler inside its request store but pipes the response body outside it, and
// the tools read the cookies (request scope). The handler must re-enter the scope for every step.
describe('createChatHandler: request scope', () => {
    it('runs the model and its tools inside the request scope while the body is read outside it', async () => {
        const scope = new AsyncLocalStorage<{ id: string }>()
        const seen: Array<string | null> = []
        const tool: CoachTool = {
            name: 'get_races',
            description: 'races',
            // SAFETY: the fake model calls `execute` directly, so the schema is never read.
            inputSchema: {} as CoachTool['inputSchema'],
            execute: async () => {
                seen.push(scope.getStore()?.id ?? null)
                return { races: [] }
            },
        }
        const store = makeStore({ tools: [tool] })
        const { handler } = setup(
            async function* (request) {
                await request.tools[0]?.execute({})
                yield { type: 'text', delta: 'after tool' }
                yield DONE
            },
            { ports: store.ports }
        )

        const response = await scope.run({ id: 'request-1' }, () =>
            handler(post({ conversationId: MINE, message: 'hi' }))
        )
        // Next starts piping the body after the handler returned: let the first pull settle.
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 20)
        })
        // The body is consumed here, outside `scope.run`, like Next's sendResponse does.
        expect(scope.getStore()).toBeUndefined()
        const events = await readLines(response)

        expect(seen).toEqual(['request-1'])
        expect(events.map((event) => event.type)).toEqual(['meta', 'text', 'done'])
    })

    it('runs the tools of a fallback model inside the request scope', async () => {
        const scope = new AsyncLocalStorage<{ id: string }>()
        const seen: Array<string | null> = []
        const tool: CoachTool = {
            name: 'get_races',
            description: 'races',
            // SAFETY: the fake model calls `execute` directly, so the schema is never read.
            inputSchema: {} as CoachTool['inputSchema'],
            execute: async () => {
                seen.push(scope.getStore()?.id ?? null)
                return { races: [] }
            },
        }
        const failing: CoachModel = {
            modelId: 'first',
            stream: async function* () {
                yield { type: 'error', kind: 'rate_limited' }
            },
        }
        const calling: CoachModel = {
            modelId: 'second',
            stream: async function* (request) {
                await request.tools[0]?.execute({})
                yield { type: 'text', delta: 'after tool' }
                yield DONE
            },
        }
        const model = createFallbackCoachModel([failing, calling])
        const store = makeStore({ tools: [tool] })
        const handler = createChatHandler({
            getUser: async () => ME,
            isConfigured: true,
            send: (user, input, signal) =>
                sendCoachMessage(user, input, { model, signal, ports: store.ports }),
        })

        const response = await scope.run({ id: 'request-2' }, () =>
            handler(post({ conversationId: MINE, message: 'hi' }))
        )
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 20)
        })
        expect(scope.getStore()).toBeUndefined()
        const events = await readLines(response)

        expect(seen).toEqual(['request-2'])
        expect(events.map((event) => event.type)).toEqual(['meta', 'model', 'text', 'done'])
    })

    it('a cancel during an in-flight pull logs nothing and throws nothing', async () => {
        const logs = spyConsole()
        // An event stream whose second step fails once the request is aborted.
        const send: Parameters<typeof createChatHandler>[0]['send'] = (_user, _input, signal) =>
            Effect.succeed({
                [Symbol.asyncIterator]: () => {
                    let step = 0
                    return {
                        next: async (): Promise<IteratorResult<ChatEvent>> => {
                            step += 1
                            if (step === 1)
                                return {
                                    done: false,
                                    value: { type: 'meta', conversationId: MINE },
                                }
                            await new Promise<void>((resolve) => {
                                signal.addEventListener('abort', () => resolve())
                            })
                            throw new Error('aborted')
                        },
                    }
                },
            })
        const handler = createChatHandler({ getUser: async () => ME, isConfigured: true, send })
        const response = await handler(post({ conversationId: MINE, message: 'hi' }))
        const reader = response.body!.getReader()
        await reader.read()
        const inFlight = reader.read()
        // Let the second pull start and wait on the abort.
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 20)
        })
        await reader.cancel()
        await expect(inFlight).resolves.toMatchObject({ done: true })
        // Let the failing pull settle before checking that it stayed silent.
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 20)
        })
        expect(logs()).toBe('[[],[],[],[]]')
    })
})
