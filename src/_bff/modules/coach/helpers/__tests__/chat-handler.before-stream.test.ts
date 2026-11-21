// @vitest-environment node
/* oxlint-disable no-await-in-loop -- one request per case, in order */
import { Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CoachQueryError } from '@/_bff/lib/errors'
import { createChatHandler } from '@/_bff/modules/coach/helpers/chat-handler.helper'
import type { CoachPorts } from '@/_bff/modules/coach/services/send-coach-message.service'
import {
    DONE,
    NO_FLAG,
    THEIRS,
    makeStore,
    post,
    script,
    setup,
    spyConsole,
    type Body,
} from '@/_bff/modules/coach/helpers/__tests__/chat-handler.fixtures'

afterEach(() => vi.restoreAllMocks())

describe('createChatHandler: before the stream', () => {
    it('answers 401 and 403 before the body is read', async () => {
        for (const user of [null, NO_FLAG]) {
            const { handler, store, requests } = setup(script(DONE), { user })
            const request = post({ conversationId: null, message: 'hi' })
            const response = await handler(request)
            expect(response.status).toBe(user === null ? 401 : 403)
            expect(request.bodyUsed).toBe(false)
            expect(store.writes).toEqual([])
            expect(requests).toEqual([])
        }
    })

    it('answers 500 when the session lookup throws', async () => {
        const store = makeStore()
        const handler = createChatHandler({
            getUser: async () => {
                throw new Error('boom')
            },
            isConfigured: true,
            send: () => Effect.die('never'),
        })
        const response = await handler(post({ conversationId: null, message: 'hi' }))
        expect(response.status).toBe(500)
        expect(store.writes).toEqual([])
    })

    it('answers 503 without a key, before the body is read', async () => {
        const { handler } = setup(script(DONE), { configured: false })
        const request = post({ conversationId: null, message: 'hi' })
        const response = await handler(request)
        expect(response.status).toBe(503)
        expect(request.bodyUsed).toBe(false)
    })

    it('answers 422 for invalid JSON, a bad shape, empty, blank and long messages', async () => {
        const { handler, store, requests } = setup(script(DONE))
        const bodies: Body[] = [
            { raw: 'not json' },
            { message: 'no conversation id' },
            { conversationId: 'not-a-uuid', message: 'hi' },
            { conversationId: null, message: 5 },
            { conversationId: null, message: '' },
            { conversationId: null, message: '   \n\t ' },
            { conversationId: null, message: 'a'.repeat(2001) },
        ]
        for (const body of bodies) {
            const response = await handler(post(body))
            expect(response.status).toBe(422)
        }
        expect(store.writes).toEqual([])
        expect(requests).toEqual([])
    })

    it('accepts a message of exactly 2000 characters after trimming', async () => {
        const { handler } = setup(script(DONE))
        const response = await handler(
            post({ conversationId: null, message: ` ${'a'.repeat(2000)} ` })
        )
        expect(response.status).toBe(200)
        await response.text()
    })

    it('answers 413 for a declared body over 16 KiB and 422 for an undeclared one', async () => {
        const { handler, store } = setup(script(DONE))
        const declared = await handler(
            post(
                { conversationId: null, message: 'hi' },
                { headers: { 'content-length': '20000' } }
            )
        )
        expect(declared.status).toBe(413)
        const big = JSON.stringify({ conversationId: null, message: 'a'.repeat(40000) })
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(big))
                controller.close()
            },
        })
        // SAFETY: `duplex` is required by the runtime for a stream body but missing from RequestInit.
        const undeclared = await handler(
            new Request('http://localhost/api/coach/chat', {
                method: 'POST',
                body: stream,
                duplex: 'half',
            } as RequestInit)
        )
        expect(undeclared.status).toBe(422)
        expect(store.writes).toEqual([])
    })

    it('answers the same 404 for another athlete conversation and a missing one, writing nothing', async () => {
        const { handler, store, requests } = setup(script(DONE))
        const foreign = await handler(post({ conversationId: THEIRS, message: 'hi' }))
        const missing = await handler(
            post({ conversationId: '33333333-3333-4333-8333-333333333333', message: 'hi' })
        )
        expect(foreign.status).toBe(404)
        expect(missing.status).toBe(404)
        const foreignBody = await foreign.text()
        expect(foreignBody).toBe(await missing.text())
        expect(foreignBody).not.toContain('secret')
        expect(store.writes).toEqual([])
        expect(requests).toEqual([])
        expect(store.messages.filter((m) => m.userId === 'user-1')).toEqual([])
    })

    it('maps infrastructure failures to a fixed 500 and logs tag and hash only', async () => {
        const logs = spyConsole()
        const store = makeStore()
        const failing: CoachPorts = {
            ...store.ports,
            saveMessage: () =>
                Effect.fail(
                    new CoachQueryError({
                        cause: 'PRIVATE-MESSAGE-TEXT',
                        error_hash: ErrorCode.COACH_MESSAGE_INSERT,
                    })
                ),
        }
        const { handler } = setup(script(DONE), { ports: failing })
        const response = await handler(
            post({ conversationId: null, message: 'PRIVATE-MESSAGE-TEXT' })
        )
        expect(response.status).toBe(500)
        const body = await response.text()
        expect(body).toBe(JSON.stringify({ error: 'Something went wrong. Try again.' }))
        const logged = logs()
        expect(logged).toContain('CoachQueryError')
        expect(logged).toContain(ErrorCode.COACH_MESSAGE_INSERT)
        expect(logged).not.toContain('PRIVATE-MESSAGE-TEXT')
    })
})
