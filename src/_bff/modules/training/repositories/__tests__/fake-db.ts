import { vi } from 'vitest'
import { asClient } from '@/_bff/lib/tests-utils'

type FakeRow = Record<string, string | number | null>

type FakeData = FakeRow | FakeRow[] | null

type QueryResult = {
    data?: FakeData
    count?: number | null
    error: { code: string; message: string; details?: string; hint?: string } | null
}

export const ok = (data: FakeData = null): QueryResult => ({ data, error: null })

// One query chain per `from()` call, settled with the next queued result (or rejection). Every
// builder method records its call and returns the chain, which is a promise settled on the next
// microtask, after the synchronous builder calls.
export const makeFakeDb = (queue: Array<QueryResult | Error>) => {
    const chains: ReturnType<typeof makeChain>[] = []
    const next = () => {
        const item = queue[chains.length] ?? queue.at(-1) ?? { data: null, error: null }
        const chain = makeChain(item)
        chains.push(chain)
        return chain
    }
    const from = vi.fn((_table: string) => next())
    return { chains, from, supabase: asClient({ from }) }
}

const makeChain = (item: QueryResult | Error) => {
    const settled = new Promise<QueryResult>((resolve, reject) => {
        queueMicrotask(() => (item instanceof Error ? reject(item) : resolve(item)))
    })
    const chain = Object.assign(settled, {
        select: vi.fn(() => chain),
        insert: vi.fn(() => chain),
        update: vi.fn(() => chain),
        delete: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        is: vi.fn(() => chain),
        in: vi.fn(() => chain),
        not: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        lte: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        maybeSingle: vi.fn(() => chain),
        single: vi.fn(() => chain),
    })
    return chain
}
