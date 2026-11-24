// Shared fixtures of the chat handler tests: an in-memory store behind the service ports and a
// fake model.
import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { vi } from 'vitest'
import { z } from 'zod'
import { createChatHandler } from '@/_bff/modules/coach/helpers/chat-handler.helper'
import type {
    CoachModel,
    CoachModelRequest,
    CoachStreamEvent,
} from '@/_bff/modules/coach/providers/coach-model'
import {
    sendCoachMessage,
    type CoachPorts,
} from '@/_bff/modules/coach/services/send-coach-message.service'
import type { CoachTool } from '@/_bff/modules/coach/types'

export type Body = { conversationId?: string | null; message?: string | number } | { raw: string }

type StoredMessage = {
    id: string
    userId: string
    conversationId: string
    role: 'user' | 'assistant'
    content: string
    createdAt: string
    model: string | null
    promptTokens: number | null
    completionTokens: number | null
}

export type Script = (request: CoachModelRequest) => AsyncGenerator<CoachStreamEvent>

const makeUser = (id: string, appMetadata: User['app_metadata']): User => ({
    id,
    app_metadata: appMetadata,
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
})

export const ME = makeUser('user-1', { roxcoach: true })
export const NO_FLAG = makeUser('user-2', { roxcoach: 'true' })
export const MINE = '11111111-1111-4111-8111-111111111111'
export const THEIRS = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-11-20T12:00:00Z')
export const CONTEXT = 'CONTEXT-BLOCK-123'
export const SECRET_KEY = 'SECRET-API-KEY-XYZ'
export const DONE: CoachStreamEvent = {
    type: 'done',
    usage: { promptTokens: 7, completionTokens: 3 },
}

export const script = (...events: CoachStreamEvent[]): Script =>
    async function* () {
        yield* events
    }

// A fake model that records every request it receives.
const makeModel = (run: Script) => {
    const requests: CoachModelRequest[] = []
    const model: CoachModel = {
        modelId: 'fake-model',
        stream: (request) => {
            requests.push(request)
            return run(request)
        },
    }
    return { model, requests }
}

// An in-memory store of two athletes, behind the ports of the service. `writes` records every
// insert so a test can prove that nothing was written.
export const makeStore = (options: { timezone?: string; tools?: CoachTool[] } = {}) => {
    const conversations = [
        { id: MINE, userId: 'user-1', title: 'Mine' },
        { id: THEIRS, userId: 'user-9', title: 'Theirs secret title' },
    ]
    const messages: StoredMessage[] = [
        {
            id: 'x1',
            userId: 'user-9',
            conversationId: THEIRS,
            role: 'user',
            content: 'OTHER-ATHLETE-TEXT',
            createdAt: '2026-11-20T09:00:00Z',
            model: null,
            promptTokens: null,
            completionTokens: null,
        },
    ]
    const writes: string[] = []
    // Slots taken per `userId|local day`.
    const usage = new Map<string, number>()
    let counter = 0
    const clock = { now: NOW }

    const ports: CoachPorts = {
        getProfile: () =>
            Effect.succeed({
                displayName: '',
                timezone: options.timezone ?? 'UTC',
                maxHr: null,
                restingHr: null,
                hyroxDivision: null,
                weeklyHoursCap: null,
                notes: null,
                dashboardMode: 'run' as const,
            }),
        findConversation: (user, id) =>
            Effect.succeed(
                conversations
                    .flatMap((c) =>
                        c.id === id && c.userId === user.id
                            ? [{ id: c.id, title: c.title, updatedAt: '2026-11-20T00:00:00Z' }]
                            : []
                    )
                    .at(0) ?? null
            ),
        createConversation: (user, title) =>
            Effect.sync(() => {
                writes.push('conversation')
                const id = `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`
                conversations.push({ id, userId: user.id, title })
                return { id, title, updatedAt: '2026-11-20T00:00:00Z' }
            }),
        saveMessage: (user, input) =>
            Effect.sync(() => {
                writes.push(`message:${input.role}`)
                const stored: StoredMessage = {
                    id: `m${++counter}`,
                    userId: user.id,
                    conversationId: input.conversationId,
                    role: input.role,
                    content: input.content,
                    createdAt: new Date(clock.now.getTime() + counter).toISOString(),
                    model: input.model ?? null,
                    promptTokens: input.promptTokens ?? null,
                    completionTokens: input.completionTokens ?? null,
                }
                messages.push(stored)
                return {
                    id: stored.id,
                    role: stored.role,
                    content: stored.content,
                    model: stored.model,
                    createdAt: stored.createdAt,
                }
            }),
        latestMessages: (user, conversationId, limit) =>
            Effect.succeed(
                messages
                    .filter((m) => m.userId === user.id && m.conversationId === conversationId)
                    .slice(-limit)
                    .map((m) => ({
                        id: m.id,
                        role: m.role,
                        content: m.content,
                        model: m.model,
                        createdAt: m.createdAt,
                    }))
            ),
        touch: () => Effect.succeed(true),
        // Like the database function: one counter per athlete and local day, apart from the messages.
        takeMessageSlot: (user, day, cap) =>
            Effect.sync(() => {
                const key = `${user.id}|${day}`
                const used = usage.get(key) ?? 0
                if (used >= cap) return false
                usage.set(key, used + 1)
                return true
            }),
        getContext: () => Effect.succeed({ context: CONTEXT, timezone: 'UTC' }),
        makeTools: () => options.tools ?? [],
    }
    return { ports, messages, writes, conversations, clock, usage }
}

export const setup = (
    run: Script,
    options: { user?: User | null; configured?: boolean; ports?: CoachPorts; now?: Date } = {}
) => {
    const store = makeStore()
    const { model, requests } = makeModel(run)
    const getUser = vi.fn(async () => (options.user === undefined ? ME : options.user))
    const handler = createChatHandler({
        getUser,
        isConfigured: options.configured ?? true,
        send: (user, input, signal) =>
            sendCoachMessage(user, input, {
                model,
                signal,
                now: options.now ?? NOW,
                ports: options.ports ?? store.ports,
            }),
    })
    return { handler, store, requests, getUser }
}

export const post = (body: Body, init: { signal?: AbortSignal; headers?: HeadersInit } = {}) =>
    new Request('http://localhost/api/coach/chat', {
        method: 'POST',
        body: 'raw' in body ? body.raw : JSON.stringify(body),
        signal: init.signal,
        headers: init.headers,
    })

export const readLines = async (response: Response) =>
    (await response.text())
        .split('\n')
        .filter((l) => l !== '')
        .map((l) => EventLineSchema.parse(JSON.parse(l)))

const EventLineSchema = z.looseObject({ type: z.string() })

export const spyConsole = () => {
    const spies = [
        vi.spyOn(console, 'error').mockImplementation(() => {}),
        vi.spyOn(console, 'warn').mockImplementation(() => {}),
        vi.spyOn(console, 'log').mockImplementation(() => {}),
        vi.spyOn(console, 'info').mockImplementation(() => {}),
    ]
    return () => JSON.stringify(spies.map((s) => s.mock.calls))
}
