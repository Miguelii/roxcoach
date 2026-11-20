// @vitest-environment node
import type { streamText } from 'ai'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createGeminiCoachModel } from '@/_bff/modules/coach/providers/gemini-coach-model'
import type { CoachStreamEvent } from '@/_bff/modules/coach/providers/coach-model'
import type { CoachTool } from '@/_bff/modules/coach/types'

type ErrorLike =
    | Error
    | { statusCode?: number; lastError?: { statusCode?: number }; message?: string }
type Part = {
    type: string
    text?: string
    error?: ErrorLike
    finishReason?: string
    totalUsage?: { inputTokens?: number; outputTokens?: number }
}
type Call = Parameters<typeof streamText>[0]

type ToolEntry = {
    description: string
    inputSchema: unknown
    execute: (input: Record<string, never>) => Promise<object>
}

const API_KEY = 'secret-key-123'

async function* parts(list: Part[], thenThrow?: Error) {
    for (const part of list) yield part
    if (thenThrow) throw thenThrow
}

const setup = (list: Part[], thenThrow?: Error) => {
    const calls: Call[] = []
    const fake = (options: Call) => {
        calls.push(options)

        return { fullStream: parts(list, thenThrow) }
    }
    // SAFETY: the fake only provides `fullStream`, the one field the model reads.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the fake only provides `fullStream`
    const generate = fake as unknown as typeof streamText
    const model = createGeminiCoachModel({ apiKey: API_KEY, modelId: 'gemini-test', generate })

    return { model, calls }
}

const TOOL: CoachTool = {
    name: 'get_races',
    description: 'Reads races',
    inputSchema: z.object({ status: z.string().optional() }),
    execute: async () => ({ races: [] }),
}

const run = async (
    model: ReturnType<typeof setup>['model'],
    signal = new AbortController().signal
) => {
    const events: CoachStreamEvent[] = []
    for await (const event of model.stream({
        system: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [TOOL],
        maxSteps: 4,
        signal,
    }))
        events.push(event)

    return events
}

const finish = (finishReason: string, totalUsage?: Part['totalUsage']) => ({
    type: 'finish',
    finishReason,
    totalUsage,
})

describe('createGeminiCoachModel', () => {
    it('exposes the model id', () => {
        expect(setup([]).model.modelId).toBe('gemini-test')
    })

    it('maps text deltas in order and one done with usage', async () => {
        const { model } = setup([
            { type: 'start' },
            { type: 'text-delta', text: 'Hel' },
            { type: 'text-delta', text: 'lo' },
            finish('stop', { inputTokens: 10, outputTokens: 5 }),
        ])

        expect(await run(model)).toEqual([
            { type: 'text', delta: 'Hel' },
            { type: 'text', delta: 'lo' },
            { type: 'done', usage: { promptTokens: 10, completionTokens: 5 } },
        ])
    })

    it('reports null usage when unknown', async () => {
        const { model } = setup([finish('stop', {})])

        expect(await run(model)).toEqual([
            { type: 'done', usage: { promptTokens: null, completionTokens: null } },
        ])
    })

    it('maps a 429 error part to rate_limited', async () => {
        const { model } = setup([{ type: 'error', error: { statusCode: 429, message: 'x' } }])

        expect(await run(model)).toEqual([{ type: 'error', kind: 'rate_limited' }])
    })

    it('maps a wrapped 429 (retry error) to rate_limited', async () => {
        const { model } = setup([{ type: 'error', error: { lastError: { statusCode: 429 } } }])

        expect(await run(model)).toEqual([{ type: 'error', kind: 'rate_limited' }])
    })

    it('maps a 5xx error to unavailable', async () => {
        const { model } = setup([{ type: 'error', error: { statusCode: 503 } }])

        expect(await run(model)).toEqual([{ type: 'error', kind: 'unavailable' }])
    })

    it('maps a thrown network error to unavailable', async () => {
        const { model } = setup([], new TypeError('fetch failed'))

        expect(await run(model)).toEqual([{ type: 'error', kind: 'unavailable' }])
    })

    it('does not classify by message text', async () => {
        const { model } = setup([{ type: 'error', error: new Error('429 rate limit exceeded') }])

        expect(await run(model)).toEqual([{ type: 'error', kind: 'unavailable' }])
    })

    it('maps a content-filter finish to blocked with no done', async () => {
        const { model } = setup([finish('content-filter')])

        expect(await run(model)).toEqual([{ type: 'error', kind: 'blocked' }])
    })

    it('ends quietly on an abort part', async () => {
        const { model } = setup([{ type: 'text-delta', text: 'a' }, { type: 'abort' }])

        expect(await run(model)).toEqual([{ type: 'text', delta: 'a' }])
    })

    it('yields no done and no error when the signal is aborted', async () => {
        const controller = new AbortController()
        controller.abort()
        const { model } = setup(
            [{ type: 'text-delta', text: 'a' }, finish('stop', {})],
            new Error('aborted')
        )

        expect(await run(model, controller.signal)).toEqual([])
    })

    it('passes the tools with their schemas, the step limit, the system and the messages', async () => {
        const { model, calls } = setup([finish('stop', {})])
        await run(model)

        const call = calls[0]
        expect(call?.instructions).toBe('sys')
        expect(call?.messages).toEqual([{ role: 'user', content: 'hi' }])
        // SAFETY: the model builds the tools as a name to tool record, checked by the assertions below.
        const tools = call?.tools as Record<string, ToolEntry>
        expect(Object.keys(tools)).toEqual(['get_races'])
        expect(tools['get_races']?.description).toBe('Reads races')
        expect(tools['get_races']?.inputSchema).toBe(TOOL.inputSchema)
        expect(await tools['get_races']?.execute({})).toEqual({ races: [] })
        expect(call?.stopWhen).toBeTypeOf('function')
    })

    it('stops after maxSteps steps', async () => {
        const { model, calls } = setup([finish('stop', {})])
        await run(model)
        // SAFETY: isStepCount returns a predicate over the steps so far, only its length matters.
        // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- isStepCount is a predicate over the steps
        const stop = calls[0]?.stopWhen as unknown as (options: { steps: number[] }) => boolean

        expect(stop({ steps: [1, 2, 3] })).toBe(false)
        expect(stop({ steps: [1, 2, 3, 4] })).toBe(true)
    })

    it('never leaks the api key into events', async () => {
        const { model } = setup([
            { type: 'text-delta', text: 'hi' },
            { type: 'error', error: { statusCode: 500, message: API_KEY } },
        ])

        expect(JSON.stringify(await run(model))).not.toContain(API_KEY)
    })
})
