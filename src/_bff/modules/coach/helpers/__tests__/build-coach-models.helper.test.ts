// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildCoachModels } from '@/_bff/modules/coach/helpers/build-coach-models.helper'
import type {
    CoachModel,
    CoachModelRequest,
    CoachStreamEvent,
} from '@/_bff/modules/coach/providers/coach-model'

type Script = () => AsyncGenerator<CoachStreamEvent>

const API_KEY = 'secret-api-key-123'
const DONE: CoachStreamEvent = { type: 'done', usage: { promptTokens: 1, completionTokens: 2 } }
const TEXT: CoachStreamEvent = { type: 'text', delta: 'hi' }
const RATE: CoachStreamEvent = { type: 'error', kind: 'rate_limited' }

const events = (...list: CoachStreamEvent[]): Script =>
    async function* () {
        yield* list
    }

const request: CoachModelRequest = {
    system: 'sys',
    messages: [{ role: 'user', content: 'hi' }],
    tools: [],
    maxSteps: 4,
    signal: new AbortController().signal,
}

const setup = (scripts: Record<string, Script>) => {
    const calls: { apiKey: string; modelId: string }[] = []
    const createModel = (options: { apiKey: string; modelId: string }): CoachModel => {
        calls.push({ apiKey: options.apiKey, modelId: options.modelId })
        const run = scripts[options.modelId]
        if (run === undefined) throw new Error('unscripted model')
        return { modelId: options.modelId, stream: () => run() }
    }
    return { calls, createModel }
}

const collect = async (model: CoachModel) => {
    const out: CoachStreamEvent[] = []
    for await (const event of model.stream(request)) out.push(event)
    return out
}

describe('buildCoachModels', () => {
    it('creates one model per id in order with the given key', () => {
        const { calls, createModel } = setup({ a: events(), b: events(), c: events() })
        buildCoachModels({
            apiKey: API_KEY,
            modelIds: ['a', 'b', 'c'],
            createModel,
            log: () => {},
        })
        expect(calls).toEqual([
            { apiKey: API_KEY, modelId: 'a' },
            { apiKey: API_KEY, modelId: 'b' },
            { apiKey: API_KEY, modelId: 'c' },
        ])
    })

    it('falls back to the second model and logs only the id and kind', async () => {
        const { createModel } = setup({ a: events(RATE), b: events(TEXT, DONE) })
        const logged: unknown[] = []
        const model = buildCoachModels({
            apiKey: API_KEY,
            modelIds: ['a', 'b'],
            createModel,
            log: (entry) => logged.push(entry),
        })
        const out = await collect(model)
        expect(out).toEqual([{ type: 'model', modelId: 'b', switchedFrom: 'a' }, TEXT, DONE])
        expect(logged).toEqual([{ modelId: 'a', kind: 'rate_limited' }])
        expect(JSON.stringify(logged)).not.toContain(API_KEY)
        expect(JSON.stringify(out)).not.toContain(API_KEY)
    })

    it('throws on an empty id list', () => {
        const { createModel } = setup({})
        expect(() =>
            buildCoachModels({ apiKey: API_KEY, modelIds: [], createModel, log: () => {} })
        ).toThrow(RangeError)
    })

    it('behaves like the plain model for a single id', async () => {
        const { createModel } = setup({ a: events(TEXT, DONE) })
        const model = buildCoachModels({
            apiKey: API_KEY,
            modelIds: ['a'],
            createModel,
            log: () => {},
        })
        expect(await collect(model)).toEqual([
            { type: 'model', modelId: 'a', switchedFrom: null },
            TEXT,
            DONE,
        ])
    })
})
