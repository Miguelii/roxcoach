import { vi } from 'vitest'
import { asClient } from '@/_bff/lib/tests-utils'

export type Json = string | number | boolean | null | undefined | Json[] | { [key: string]: Json }

type Operation = 'select' | 'insert' | 'update' | 'upsert' | 'delete'

export type Call = {
    table: string
    op: Operation
    payload: Json
    options: Json
    filters: Array<[column: string, value: Json]>
}

export type QueryResult = {
    data?: Json
    error: { code: string; message: string; details?: string; hint?: string } | null
}

export const ok = (data: Json = null): QueryResult => ({ data, error: null })

// A fake service-role client: every `from()` call returns a chain that records the operation,
// payload and filters, and is settled by `handler` on the next microtask, after the synchronous
// builder calls.
export const makeFakeAdminDb = (handler: (call: Call) => QueryResult | Error) => {
    const calls: Call[] = []

    const from = vi.fn((table: string) => {
        const call: Call = {
            table,
            op: 'select',
            payload: undefined,
            options: undefined,
            filters: [],
        }
        calls.push(call)

        const settled = new Promise<QueryResult>((resolve, reject) => {
            queueMicrotask(() => {
                const outcome = handler(call)
                if (outcome instanceof Error) reject(outcome)
                else resolve(outcome)
            })
        })

        const writer = (op: Operation) =>
            vi.fn((payload?: Json, options?: Json) => {
                call.op = op
                call.payload = payload
                call.options = options
                return chain
            })
        const filter = vi.fn((column: string, value: Json) => {
            call.filters.push([column, value])
            return chain
        })

        const chain = Object.assign(settled, {
            select: vi.fn(() => chain),
            insert: writer('insert'),
            update: writer('update'),
            upsert: writer('upsert'),
            delete: writer('delete'),
            eq: filter,
            in: vi.fn((column: string, values: Json) => {
                call.filters.push([`${column}:in`, values])
                return chain
            }),
            is: filter,
            maybeSingle: vi.fn(() => chain),
            single: vi.fn(() => chain),
        })
        return chain
    })

    return { calls, from, supabase: asClient({ from }) }
}
