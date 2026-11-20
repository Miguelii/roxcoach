// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createFallbackCoachModel } from '@/_bff/modules/coach/providers/fallback-coach-model'
import type {
    CoachModel,
    CoachModelRequest,
    CoachStreamEvent,
} from '@/_bff/modules/coach/providers/coach-model'

type Script = (request: CoachModelRequest) => AsyncGenerator<CoachStreamEvent>

const DONE: CoachStreamEvent = { type: 'done', usage: { promptTokens: 1, completionTokens: 2 } }
const TEXT: CoachStreamEvent = { type: 'text', delta: 'hi' }
const RATE: CoachStreamEvent = { type: 'error', kind: 'rate_limited' }
const UNAVAILABLE: CoachStreamEvent = { type: 'error', kind: 'unavailable' }

const events = (...list: CoachStreamEvent[]): Script =>
    async function* () {
        yield* list
    }

const fake = (modelId: string, run: Script) => {
    const requests: CoachModelRequest[] = []
    const model: CoachModel = {
        modelId,
        stream: (request) => {
            requests.push(request)
            return run(request)
        },
    }
    return { model, requests }
}

const makeRequest = (signal = new AbortController().signal): CoachModelRequest => ({
    system: 'sys',
    messages: [{ role: 'user', content: 'hi' }],
    tools: [],
    maxSteps: 4,
    signal,
})

const collect = async (model: CoachModel, request = makeRequest()) => {
    const out: CoachStreamEvent[] = []
    for await (const event of model.stream(request)) out.push(event)
    return out
}

const terminals = (list: CoachStreamEvent[]) =>
    list.filter((e) => e.type === 'done' || e.type === 'error')

describe('createFallbackCoachModel', () => {
    it('uses the first model and never starts the second', async () => {
        const a = fake('a', events(TEXT, DONE))
        const b = fake('b', events(TEXT, DONE))
        const out = await collect(createFallbackCoachModel([a.model, b.model]))
        expect(out).toEqual([{ type: 'model', modelId: 'a', switchedFrom: null }, TEXT, DONE])
        expect(b.requests).toHaveLength(0)
    })

    it('falls back on rate_limited before text with the identical request', async () => {
        const a = fake('a', events(RATE))
        const b = fake('b', events(TEXT, DONE))
        const fallbacks: unknown[] = []
        const request = makeRequest()
        const out = await collect(
            createFallbackCoachModel([a.model, b.model], {
                onFallback: (entry) => fallbacks.push(entry),
            }),
            request
        )
        expect(out).toEqual([{ type: 'model', modelId: 'b', switchedFrom: 'a' }, TEXT, DONE])
        expect(fallbacks).toEqual([{ modelId: 'a', kind: 'rate_limited' }])
        expect(b.requests[0]).toBe(request)
        expect(a.requests[0]).toBe(request)
    })

    it('falls back on unavailable before text', async () => {
        const a = fake('a', events(UNAVAILABLE))
        const b = fake('b', events(TEXT, DONE))
        const out = await collect(createFallbackCoachModel([a.model, b.model]))
        expect(out[0]).toEqual({ type: 'model', modelId: 'b', switchedFrom: 'a' })
    })

    it('counts a throw before text as unavailable and falls back', async () => {
        const a = fake('a', async function* () {
            yield* []
            throw new Error('boom')
        })
        const b = fake('b', events(TEXT, DONE))
        const fallbacks: unknown[] = []
        const out = await collect(
            createFallbackCoachModel([a.model, b.model], {
                onFallback: (entry) => fallbacks.push(entry),
            })
        )
        expect(out).toEqual([{ type: 'model', modelId: 'b', switchedFrom: 'a' }, TEXT, DONE])
        expect(fallbacks).toEqual([{ modelId: 'a', kind: 'unavailable' }])
    })

    it('counts a stream that ends without a terminal event as unavailable', async () => {
        const a = fake('a', events())
        const b = fake('b', events(TEXT, DONE))
        const fallbacks: unknown[] = []
        const out = await collect(
            createFallbackCoachModel([a.model, b.model], {
                onFallback: (entry) => fallbacks.push(entry),
            })
        )
        expect(out[0]).toEqual({ type: 'model', modelId: 'b', switchedFrom: 'a' })
        expect(fallbacks).toEqual([{ modelId: 'a', kind: 'unavailable' }])
    })

    it('passes blocked through and starts no second model', async () => {
        const blocked: CoachStreamEvent = { type: 'error', kind: 'blocked' }
        const a = fake('a', events(blocked))
        const b = fake('b', events(TEXT, DONE))
        const out = await collect(createFallbackCoachModel([a.model, b.model]))
        expect(out).toEqual([blocked])
        expect(b.requests).toHaveLength(0)
    })

    it('passes blocked after text through unchanged', async () => {
        const blocked: CoachStreamEvent = { type: 'error', kind: 'blocked' }
        const a = fake('a', events(TEXT, blocked))
        const b = fake('b', events(TEXT, DONE))
        const out = await collect(createFallbackCoachModel([a.model, b.model]))
        expect(out.at(-1)).toEqual(blocked)
        expect(b.requests).toHaveLength(0)
    })

    it('passes done with no text through without a model event', async () => {
        const a = fake('a', events(DONE))
        const b = fake('b', events(TEXT, DONE))
        const out = await collect(createFallbackCoachModel([a.model, b.model]))
        expect(out).toEqual([DONE])
        expect(b.requests).toHaveLength(0)
    })

    it('passes an error after text through and never starts another model', async () => {
        const a = fake('a', events(TEXT, RATE))
        const b = fake('b', events(TEXT, DONE))
        const fallbacks: unknown[] = []
        const out = await collect(
            createFallbackCoachModel([a.model, b.model], {
                onFallback: (entry) => fallbacks.push(entry),
            })
        )
        expect(out).toEqual([{ type: 'model', modelId: 'a', switchedFrom: null }, TEXT, RATE])
        expect(b.requests).toHaveLength(0)
        expect(fallbacks).toEqual([])
    })

    it('emits nothing and starts no model when aborted before the call', async () => {
        const controller = new AbortController()
        controller.abort()
        const a = fake('a', events(TEXT, DONE))
        const out = await collect(
            createFallbackCoachModel([a.model]),
            makeRequest(controller.signal)
        )
        expect(out).toEqual([])
        expect(a.requests).toHaveLength(0)
    })

    it('emits nothing more when aborted from inside the first stream', async () => {
        const controller = new AbortController()
        const a = fake('a', async function* () {
            controller.abort()
            yield RATE
        })
        const b = fake('b', events(TEXT, DONE))
        const out = await collect(
            createFallbackCoachModel([a.model, b.model]),
            makeRequest(controller.signal)
        )
        expect(out).toEqual([])
        expect(b.requests).toHaveLength(0)
    })

    it('starts no further model when aborted between models', async () => {
        const controller = new AbortController()
        const a = fake('a', async function* () {
            yield RATE
        })
        const b = fake('b', events(TEXT, DONE))
        const out = await collect(
            createFallbackCoachModel([a.model, b.model], { onFallback: () => controller.abort() }),
            makeRequest(controller.signal)
        )
        expect(out).toEqual([])
        expect(b.requests).toHaveLength(0)
    })

    it('stops quietly when aborted mid-reply', async () => {
        const controller = new AbortController()
        const a = fake('a', async function* () {
            yield TEXT
            controller.abort()
            yield DONE
        })
        const out = await collect(
            createFallbackCoachModel([a.model]),
            makeRequest(controller.signal)
        )
        expect(terminals(out)).toEqual([])
    })

    it('emits exactly one rate_limited error when all models were rate limited', async () => {
        const list = ['a', 'b', 'c'].map((id) => fake(id, events(RATE)).model)
        const out = await collect(createFallbackCoachModel(list))
        expect(out).toEqual([RATE])
    })

    it('emits exactly one unavailable error for mixed failures', async () => {
        const list = [
            fake('a', events(RATE)).model,
            fake('b', events(UNAVAILABLE)).model,
            fake('c', events(RATE)).model,
        ]
        const out = await collect(createFallbackCoachModel(list))
        expect(out).toEqual([UNAVAILABLE])
    })

    it('behaves like the plain model plus the model event for a single model', async () => {
        const a = fake('a', events(TEXT, DONE))
        const wrapper = createFallbackCoachModel([a.model])
        expect(wrapper.modelId).toBe('a')
        expect(terminals(await collect(wrapper))).toEqual([DONE])
    })

    it('throws a RangeError for an empty list', () => {
        expect(() => createFallbackCoachModel([])).toThrow(RangeError)
    })

    it('records nothing when the first model aborts and ends with no events', async () => {
        const controller = new AbortController()
        const a = fake('a', async function* () {
            controller.abort()
            yield* []
        })
        const b = fake('b', events(TEXT, DONE))
        const fallbacks: unknown[] = []
        const out = await collect(
            createFallbackCoachModel([a.model, b.model], {
                onFallback: (entry) => fallbacks.push(entry),
            }),
            makeRequest(controller.signal)
        )
        expect(out).toEqual([])
        expect(fallbacks).toEqual([])
        expect(b.requests).toHaveLength(0)
    })

    it('records nothing when the first model aborts and throws', async () => {
        const controller = new AbortController()
        const a = fake('a', async function* () {
            controller.abort()
            yield* []
            throw new Error('aborted')
        })
        const b = fake('b', events(TEXT, DONE))
        const fallbacks: unknown[] = []
        const out = await collect(
            createFallbackCoachModel([a.model, b.model], {
                onFallback: (entry) => fallbacks.push(entry),
            }),
            makeRequest(controller.signal)
        )
        expect(out).toEqual([])
        expect(fallbacks).toEqual([])
        expect(b.requests).toHaveLength(0)
    })

    it('drops a provider model event so only the wrapper announces', async () => {
        const a = fake(
            'a',
            events({ type: 'model', modelId: 'inner', switchedFrom: null }, TEXT, DONE)
        )
        const out = await collect(createFallbackCoachModel([a.model]))
        expect(out).toEqual([{ type: 'model', modelId: 'a', switchedFrom: null }, TEXT, DONE])
    })

    it('uses the second skipped id as switchedFrom and reports both failures in order', async () => {
        const fallbacks: unknown[] = []
        const list = [
            fake('a', events(RATE)).model,
            fake('b', events(UNAVAILABLE)).model,
            fake('c', events(TEXT, DONE)).model,
        ]
        const out = await collect(
            createFallbackCoachModel(list, { onFallback: (entry) => fallbacks.push(entry) })
        )
        expect(out[0]).toEqual({ type: 'model', modelId: 'c', switchedFrom: 'b' })
        expect(fallbacks).toEqual([
            { modelId: 'a', kind: 'rate_limited' },
            { modelId: 'b', kind: 'unavailable' },
        ])
    })

    it('emits one error when the only model fails', async () => {
        const out = await collect(createFallbackCoachModel([fake('a', events(RATE)).model]))
        expect(out).toEqual([RATE])
    })

    it('runs the finally of a skipped model and of the active model on early stop', async () => {
        const cleaned: string[] = []
        const a = fake('a', async function* () {
            try {
                yield RATE
                yield TEXT
            } finally {
                cleaned.push('a')
            }
        })
        const b = fake('b', async function* () {
            try {
                yield TEXT
                yield TEXT
                yield DONE
            } finally {
                cleaned.push('b')
            }
        })
        const wrapper = createFallbackCoachModel([a.model, b.model])
        for await (const event of wrapper.stream(makeRequest())) {
            if (event.type === 'text') break
        }
        expect(cleaned).toEqual(['a', 'b'])
    })
})
