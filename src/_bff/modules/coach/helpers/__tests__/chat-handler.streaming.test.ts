// @vitest-environment node
/* oxlint-disable unicorn/consistent-function-scoping -- test helpers stay next to the cases that use them */
/* oxlint-disable no-await-in-loop, max-lines-per-function -- one describe for the stream; requests run in order */
import { Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CoachQueryError } from '@/_bff/lib/errors'
import { buildCoachSystemPrompt } from '@/_bff/modules/coach/helpers/coach-system-prompt.helper'
import type { CoachPorts } from '@/_bff/modules/coach/services/send-coach-message.service'
import {
    CONTEXT,
    DONE,
    ME,
    MINE,
    SECRET_KEY,
    THEIRS,
    makeStore,
    post,
    readLines,
    script,
    setup,
    spyConsole,
} from '@/_bff/modules/coach/helpers/__tests__/chat-handler.fixtures'

afterEach(() => vi.restoreAllMocks())

describe('createChatHandler: the stream', () => {
    it('cuts the title by code points: an emoji on the 60th character stays whole', async () => {
        const message = `${'x'.repeat(59)}\u{1F3CB}\u{FE0F}tail`
        const { handler, store } = setup(script(DONE))

        await (await handler(post({ conversationId: null, message }))).text()

        const title = store.conversations.at(-1)?.title ?? ''
        expect(title).toBe(`${'x'.repeat(59)}\u{1F3CB}`)
        expect(Array.from(title)).toHaveLength(60)
        expect(title.isWellFormed()).toBe(true)
    })

    it('creates the conversation with the first 60 characters, saves the user message, meta comes first', async () => {
        const message = 'x'.repeat(100)
        const { handler, store, requests } = setup(
            script({ type: 'text', delta: 'Hel' }, { type: 'text', delta: 'lo' }, DONE)
        )
        const response = await handler(post({ conversationId: null, message: `  ${message}  ` }))
        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toBe('application/x-ndjson; charset=utf-8')
        expect(response.headers.get('cache-control')).toBe('no-store')

        const events = await readLines(response)
        const created = store.conversations.at(-1)
        expect(created?.title).toBe('x'.repeat(60))
        expect(events).toEqual([
            { type: 'meta', conversationId: created?.id },
            { type: 'text', delta: 'Hel' },
            { type: 'text', delta: 'lo' },
            { type: 'done' },
        ])
        expect(store.writes).toEqual(['conversation', 'message:user', 'message:assistant'])
        expect(
            store.messages.find((m) => m.role === 'user' && m.userId === 'user-1')?.content
        ).toBe(message)
        expect(requests[0]?.messages).toEqual([{ role: 'user', content: message }])
        expect(requests[0]?.maxSteps).toBe(5)
        expect(requests[0]?.system).toBe(buildCoachSystemPrompt(CONTEXT))
    })

    it('saves the assistant text once with the model id and usage', async () => {
        const { handler, store } = setup(
            script({ type: 'text', delta: 'A' }, { type: 'text', delta: 'B' }, DONE)
        )
        const response = await handler(post({ conversationId: MINE, message: 'hi' }))
        await response.text()
        const replies = store.messages.filter(
            (m) => m.role === 'assistant' && m.userId === 'user-1'
        )
        expect(replies).toHaveLength(1)
        expect(replies[0]).toMatchObject({
            content: 'AB',
            model: 'fake-model',
            promptTokens: 7,
            completionTokens: 3,
            conversationId: MINE,
        })
    })

    it('forwards the model event as one exact NDJSON line and saves the answering model', async () => {
        const { handler, store } = setup(
            script(
                { type: 'model', modelId: 'm2', switchedFrom: 'm1' },
                { type: 'text', delta: 'Hi' },
                DONE
            )
        )
        const response = await handler(post({ conversationId: MINE, message: 'hi' }))
        const lines = (await response.text()).split('\n').filter((l) => l !== '')
        expect(lines[1]).toBe('{"type":"model","model":"m2","switchedFrom":"m1"}')
        expect(lines.map((l) => /"type":"(\w+)"/u.exec(l)?.[1])).toEqual([
            'meta',
            'model',
            'text',
            'done',
        ])
        expect(store.messages.find((m) => m.role === 'assistant')?.model).toBe('m2')
    })

    it('a model event with no switch has switchedFrom null on the wire', async () => {
        const { handler } = setup(
            script(
                { type: 'model', modelId: 'm1', switchedFrom: null },
                { type: 'text', delta: 'Hi' },
                DONE
            )
        )
        const response = await handler(post({ conversationId: MINE, message: 'hi' }))
        expect((await response.text()).split('\n')[1]).toBe(
            '{"type":"model","model":"m1","switchedFrom":null}'
        )
    })

    it('saves the fake model own id when the provider emits no model event', async () => {
        const { handler, store } = setup(script({ type: 'text', delta: 'Hi' }, DONE))
        const events = await readLines(await handler(post({ conversationId: MINE, message: 'hi' })))
        expect(events.map((e) => e.type)).toEqual(['meta', 'text', 'done'])
        expect(store.messages.find((m) => m.role === 'assistant')?.model).toBe('fake-model')
    })

    it('an error after a model event saves nothing and ends with the error', async () => {
        const { handler, store } = setup(
            script(
                { type: 'model', modelId: 'm2', switchedFrom: 'm1' },
                { type: 'text', delta: 'half' },
                { type: 'error', kind: 'unavailable' }
            )
        )
        const events = await readLines(await handler(post({ conversationId: MINE, message: 'hi' })))
        expect(events.at(-1)).toEqual({ type: 'error', kind: 'unavailable' })
        expect(events.some((e) => e.type === 'done')).toBe(false)
        expect(store.messages.some((m) => m.role === 'assistant')).toBe(false)
    })

    it('an error before any model event emits no model event', async () => {
        const { handler } = setup(script({ type: 'error', kind: 'unavailable' }))
        const events = await readLines(await handler(post({ conversationId: MINE, message: 'hi' })))
        expect(events.map((e) => e.type)).toEqual(['meta', 'error'])
    })

    it('an abort after a model event saves nothing and emits no done', async () => {
        const controller = new AbortController()
        let release: () => void = () => {}
        const gate = new Promise<void>((resolve) => {
            release = resolve
        })
        const { handler, store } = setup(async function* () {
            yield { type: 'model', modelId: 'm2', switchedFrom: 'm1' }
            yield { type: 'text', delta: 'partial' }
            await gate
            yield DONE
        })
        const response = await handler(
            post({ conversationId: MINE, message: 'hi' }, { signal: controller.signal })
        )
        const reader = response.body!.getReader()
        // meta
        await reader.read()
        // model
        await reader.read()
        // partial
        await reader.read()
        controller.abort()
        release()
        const rest = await reader.read()
        expect(rest.done || rest.value === undefined).toBe(true)
        expect(store.messages.some((m) => m.role === 'assistant')).toBe(false)
    })

    it('history DTOs carry model null for user messages', async () => {
        const { store } = setup(script(DONE))
        const out = await Effect.runPromise(store.ports.latestMessages(ME, MINE, 10))
        expect(out.every((m) => m.model === null)).toBe(true)
    })

    it('saves no assistant message for an empty reply but still ends with done', async () => {
        const { handler, store } = setup(script(DONE))
        const events = await readLines(await handler(post({ conversationId: MINE, message: 'hi' })))
        expect(events.at(-1)).toEqual({ type: 'done' })
        expect(store.writes).toEqual(['message:user'])
    })

    it('still emits done when saving the assistant message fails, logging tag only', async () => {
        const logs = spyConsole()
        const store = makeStore()
        const ports: CoachPorts = {
            ...store.ports,
            saveMessage: (user, input) =>
                input.role === 'assistant'
                    ? Effect.fail(
                          new CoachQueryError({
                              cause: 'REPLY-TEXT',
                              error_hash: ErrorCode.COACH_MESSAGE_INSERT_ERR,
                          })
                      )
                    : store.ports.saveMessage(user, input),
        }
        const { handler } = setup(script({ type: 'text', delta: 'REPLY-TEXT' }, DONE), { ports })
        const events = await readLines(await handler(post({ conversationId: MINE, message: 'hi' })))
        expect(events.at(-1)).toEqual({ type: 'done' })
        expect(logs()).toContain('AssistantSaveFailure')
        expect(logs()).not.toContain('REPLY-TEXT')
    })

    it('a cancelled request keeps the user message and saves no assistant message', async () => {
        const controller = new AbortController()
        let release: () => void = () => {}
        const gate = new Promise<void>((resolve) => {
            release = resolve
        })
        const { handler, store, requests } = setup(async function* () {
            yield { type: 'text', delta: 'partial' }
            await gate
            yield { type: 'text', delta: ' more' }
            yield DONE
        })
        const response = await handler(
            post({ conversationId: MINE, message: 'hi' }, { signal: controller.signal })
        )
        const reader = response.body!.getReader()
        // meta
        await reader.read()
        // partial
        await reader.read()
        controller.abort()
        expect(requests[0]?.signal.aborted).toBe(true)
        release()
        const rest = await reader.read()
        expect(rest.done || rest.value === undefined).toBe(true)
        expect(store.writes).toEqual(['message:user'])
        expect(store.messages.some((m) => m.role === 'assistant')).toBe(false)
    })

    it('cancelling the response body aborts the model signal and saves nothing', async () => {
        const { handler, store, requests } = setup(async function* (request) {
            yield { type: 'text', delta: 'partial' }
            await new Promise<void>((resolve) => {
                request.signal.addEventListener('abort', () => resolve())
            })
        })
        const response = await handler(post({ conversationId: MINE, message: 'hi' }))
        const reader = response.body!.getReader()
        await reader.read()
        await reader.read()
        await reader.cancel()
        expect(requests[0]?.signal.aborted).toBe(true)
        expect(store.writes).toEqual(['message:user'])
    })

    it('a provider error yields one error line, no assistant message and no done', async () => {
        for (const kind of ['rate_limited', 'unavailable', 'blocked'] as const) {
            const { handler, store } = setup(
                script({ type: 'text', delta: 'half' }, { type: 'error', kind })
            )
            const events = await readLines(
                await handler(post({ conversationId: MINE, message: 'hi' }))
            )
            expect(events.at(-1)).toEqual({ type: 'error', kind })
            expect(events.filter((e) => e.type === 'done')).toEqual([])
            expect(store.messages.some((m) => m.role === 'assistant')).toBe(false)
        }
    })

    it('ends with an error when the model stream throws or ends without a terminal event', async () => {
        const logs = spyConsole()
        const throwing = setup(async function* () {
            yield { type: 'text', delta: 'x' }
            throw new Error('SECRET-CAUSE')
        })
        const a = await readLines(
            await throwing.handler(post({ conversationId: MINE, message: 'hi' }))
        )
        expect(a.at(-1)).toEqual({ type: 'error', kind: 'unavailable' })
        expect(logs()).not.toContain('SECRET-CAUSE')
        const silent = setup(script({ type: 'text', delta: 'x' }))
        const b = await readLines(
            await silent.handler(post({ conversationId: MINE, message: 'hi' }))
        )
        expect(b.at(-1)).toEqual({ type: 'error', kind: 'unavailable' })
        expect(silent.store.messages.some((m) => m.role === 'assistant')).toBe(false)
    })

    it('merges an orphan user turn so the model never gets two user turns in a row', async () => {
        const { handler, requests, store } = setup(async function* (request) {
            if (request.messages.length === 1 && request.messages[0]?.content === 'first')
                yield { type: 'error', kind: 'unavailable' }
            else yield DONE
        })
        await (await handler(post({ conversationId: MINE, message: 'first' }))).text()
        await (await handler(post({ conversationId: MINE, message: 'second' }))).text()
        expect(requests[1]?.messages).toEqual([{ role: 'user', content: 'first\n\nsecond' }])
        for (const request of requests) {
            request.messages.forEach((m, i) => {
                if (i > 0)
                    expect(!(m.role === 'user' && request.messages[i - 1]?.role === 'user')).toBe(
                        true
                    )
            })
        }
        expect(
            store.messages.filter((m) => m.role === 'user' && m.userId === 'user-1')
        ).toHaveLength(2)
    })

    it('sends only the last 20 messages including the new one', async () => {
        const { handler, store, requests } = setup(script(DONE))
        for (let i = 0; i < 30; i++)
            await Effect.runPromise(
                store.ports.saveMessage(ME, {
                    conversationId: MINE,
                    role: i % 2 === 0 ? 'user' : 'assistant',
                    content: `old${i}`,
                })
            )
        await (await handler(post({ conversationId: MINE, message: 'latest' }))).text()
        const sent = requests[0]?.messages ?? []
        // The window is old11..old29 plus the new message; old11 is an assistant turn and is dropped.
        // SAFETY: the alternating roles are literal 'user' and 'assistant'.
        const expected = Array.from({ length: 18 }, (_, i) => ({
            role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
            content: `old${i + 12}`,
        }))
        expect(sent).toEqual([...expected, { role: 'user', content: 'latest' }])
    })

    it('does not leak the key, the prompt or another conversation into responses or logs', async () => {
        const logs = spyConsole()
        const { handler } = setup(script({ type: 'text', delta: 'ok' }, DONE))
        const bodies = [
            await (await handler(post({ conversationId: MINE, message: 'hi' }))).text(),
            await (await handler(post({ conversationId: THEIRS, message: 'hi' }))).text(),
            await (await handler(post({ raw: 'nope' }))).text(),
        ].join('\n')
        for (const secret of [SECRET_KEY, CONTEXT, 'ATHLETE DATA', 'OTHER-ATHLETE-TEXT']) {
            expect(bodies).not.toContain(secret)
            expect(logs()).not.toContain(secret)
        }
    })
})
