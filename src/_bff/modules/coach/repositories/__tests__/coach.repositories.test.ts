/* oxlint-disable no-await-in-loop -- one query per case, in order */
import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { asClient, failureTag } from '@/_bff/lib/tests-utils'
import { makeFakeAdminDb, ok, type Call } from '@/_bff/lib/fake-admin-db'
import {
    deleteConversationById,
    insertConversation,
    selectConversation,
    selectConversations,
    touchConversation,
} from '@/_bff/modules/coach/repositories/coach-conversations.repository'
import {
    insertMessage,
    selectLatestMessages,
} from '@/_bff/modules/coach/repositories/coach-messages.repository'
import { takeMessageSlot } from '@/_bff/modules/coach/repositories/coach-usage.repository'
import type { CoachClient } from '@/_bff/modules/coach/repositories/coach-query'

const ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'
const DENIED = { data: null, error: { code: '42501', message: 'denied' } }

const CONVERSATION_ROW = { id: ID, title: 'Hello', updated_at: '2026-11-20T10:00:00Z' }
const message = (id: string, createdAt: string, role = 'user', model: string | null = null) => ({
    id,
    role,
    content: `text ${id}`,
    model,
    created_at: createdAt,
})

// A fake client with only `rpc`, settled by `handler` (an Error rejects like a thrown call).
type RpcOutcome =
    | Error
    | { data: boolean | string | null; error: { code: string; message: string } | null }

const makeRpcClient = (handler: () => RpcOutcome) => {
    const rpc = vi.fn(async () => {
        const outcome = handler()
        if (outcome instanceof Error) throw outcome
        return outcome
    })
    // The repository only calls `rpc`; `from` is there to satisfy the fake client type.
    const client: CoachClient = asClient({ from: vi.fn(), rpc })
    return { rpc, client }
}

const filterValue = (call: Call, column: string) =>
    call.filters.find(([name]) => name === column)?.[1]
const has = (call: Call, name: string) => call.filters.some(([column]) => column === name)

// Two athletes' conversations: only rows matching every id and user_id filter are affected.
const twoUsersConversations = () => {
    const rows = [
        { ...CONVERSATION_ROW, user_id: 'user-1' },
        { ...CONVERSATION_ROW, id: OTHER_ID, user_id: 'user-2' },
    ]
    return makeFakeAdminDb((call: Call) => {
        const match = rows.filter(
            (row) =>
                row.id === filterValue(call, 'id') && row.user_id === filterValue(call, 'user_id')
        )
        if (call.op === 'delete' || call.op === 'update')
            return ok(match.map((row) => ({ id: row.id })))
        return ok(match[0] ? { ...match[0] } : null)
    })
}

describe('coach conversations repository', () => {
    it('selectConversations is newest first, limited and filtered by user_id', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok([CONVERSATION_ROW]))

        const rows = await Effect.runPromise(selectConversations(supabase, 'user-1', 30))

        expect(rows).toEqual([{ id: ID, title: 'Hello', updatedAt: '2026-11-20T10:00:00Z' }])
        const [call] = calls
        expect(call?.table).toBe('coach_conversations')
        expect(filterValue(call!, 'user_id')).toBe('user-1')
        expect(has(call!, 'order:updated_at:desc')).toBe(true)
        expect(filterValue(call!, 'limit')).toBe(30)
    })

    it('selectConversation combines id and user_id; another athlete id is null', async () => {
        const { calls, supabase } = twoUsersConversations()

        expect(await Effect.runPromise(selectConversation(supabase, 'user-1', ID))).toEqual({
            id: ID,
            title: 'Hello',
            updatedAt: '2026-11-20T10:00:00Z',
        })
        expect(await Effect.runPromise(selectConversation(supabase, 'user-1', OTHER_ID))).toBeNull()
        expect(calls.every((call) => filterValue(call, 'user_id') === 'user-1')).toBe(true)
        expect(filterValue(calls[1]!, 'id')).toBe(OTHER_ID)
    })

    it('insertConversation sets user_id and cuts the title to 60 characters', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok(CONVERSATION_ROW))

        await Effect.runPromise(insertConversation(supabase, 'user-1', 'x'.repeat(80)))

        expect(calls[0]?.op).toBe('insert')
        expect(calls[0]?.payload).toEqual({ user_id: 'user-1', title: 'x'.repeat(60) })
    })

    it('insertConversation never splits a surrogate pair at the 60 character boundary', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok(CONVERSATION_ROW))

        await Effect.runPromise(
            insertConversation(supabase, 'user-1', `${'x'.repeat(59)}\u{1F3CB}\u{1F3CB}`)
        )

        expect(calls[0]?.payload).toEqual({
            user_id: 'user-1',
            title: `${'x'.repeat(59)}\u{1F3CB}`,
        })
    })

    it('touchConversation updates updated_at filtered by id and user_id', async () => {
        const { calls, supabase } = twoUsersConversations()

        expect(await Effect.runPromise(touchConversation(supabase, 'user-1', ID))).toBe(true)
        expect(await Effect.runPromise(touchConversation(supabase, 'user-1', OTHER_ID))).toBe(false)
        expect(calls[0]?.op).toBe('update')
        expect(calls[0]?.payload).toEqual({ updated_at: expect.any(String) })
        expect(filterValue(calls[1]!, 'user_id')).toBe('user-1')
    })

    it('deleteConversationById reports false for another athlete id', async () => {
        const { calls, supabase } = twoUsersConversations()

        expect(await Effect.runPromise(deleteConversationById(supabase, 'user-1', ID))).toBe(true)
        expect(await Effect.runPromise(deleteConversationById(supabase, 'user-1', OTHER_ID))).toBe(
            false
        )
        expect(calls.every((call) => call.op === 'delete')).toBe(true)
        expect(calls.every((call) => filterValue(call, 'user_id') === 'user-1')).toBe(true)
    })

    it('fails with the thrown, returned and parse branches of every call', async () => {
        const cases: Array<
            [
                string,
                (
                    db: ReturnType<typeof makeFakeAdminDb>
                ) => Effect.Effect<unknown, { _tag: string }>,
                string,
            ]
        > = [
            ['list', (db) => selectConversations(db.supabase, 'u', 30), 'CoachQueryError'],
            ['one', (db) => selectConversation(db.supabase, 'u', ID), 'CoachQueryError'],
            ['insert', (db) => insertConversation(db.supabase, 'u', 't'), 'CoachWriteError'],
            ['touch', (db) => touchConversation(db.supabase, 'u', ID), 'CoachWriteError'],
            ['delete', (db) => deleteConversationById(db.supabase, 'u', ID), 'CoachWriteError'],
        ]
        for (const [name, run, tag] of cases) {
            const thrown = makeFakeAdminDb(() => new Error('boom'))
            const returned = makeFakeAdminDb(() => DENIED)
            const malformed = makeFakeAdminDb(() => ok([{ nope: 1 }]))
            const hashes = new Set<unknown>()
            for (const db of [thrown, returned, malformed]) {
                const exit = await Effect.runPromiseExit(run(db))
                expect(failureTag(exit), name).toBe(tag)
                hashes.add(JSON.stringify(exit))
            }
            expect(hashes.size, name).toBe(3)
        }
    })
})

describe('coach messages repository', () => {
    it('selectLatestMessages takes the newest N and returns them oldest first', async () => {
        const newestFirst = [
            message('m3', '2026-11-20T10:03:00Z'),
            message('m2', '2026-11-20T10:02:00Z', 'assistant'),
            message('m1', '2026-11-20T10:01:00Z'),
        ]
        const { calls, supabase } = makeFakeAdminDb(() => ok(newestFirst))

        const rows = await Effect.runPromise(selectLatestMessages(supabase, 'user-1', ID, 200))

        expect(rows.map((row) => row.id)).toEqual(['m1', 'm2', 'm3'])
        expect(rows[0]).toEqual({
            id: 'm1',
            role: 'user',
            content: 'text m1',
            model: null,
            createdAt: '2026-11-20T10:01:00Z',
        })
        const [call] = calls
        expect(call?.table).toBe('coach_messages')
        expect(filterValue(call!, 'conversation_id')).toBe(ID)
        expect(filterValue(call!, 'user_id')).toBe('user-1')
        expect(has(call!, 'order:created_at:desc')).toBe(true)
        expect(filterValue(call!, 'limit')).toBe(200)
    })

    it('selectLatestMessages selects the model column and maps it, null for old rows', async () => {
        const rows = [
            message('m2', '2026-11-20T10:02:00Z', 'assistant', 'gemini-b'),
            message('m1', '2026-11-20T10:01:00Z', 'assistant'),
        ]
        const { supabase } = makeFakeAdminDb(() => ok(rows))

        const out = await Effect.runPromise(selectLatestMessages(supabase, 'user-1', ID, 200))

        expect(out.map((row) => row.model)).toEqual([null, 'gemini-b'])
    })

    it('selectLatestMessages is empty for another athlete conversation id', async () => {
        const rows = [
            { ...message('m1', '2026-11-20T10:00:00Z'), conversation_id: ID, user_id: 'user-2' },
        ]
        const { supabase } = makeFakeAdminDb((call) =>
            ok(
                rows.filter(
                    (row) =>
                        row.conversation_id === filterValue(call, 'conversation_id') &&
                        row.user_id === filterValue(call, 'user_id')
                )
            )
        )

        expect(await Effect.runPromise(selectLatestMessages(supabase, 'user-1', ID, 200))).toEqual(
            []
        )
    })

    it('insertMessage sets user_id and nulls the assistant-only columns for user messages', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok(message('m1', '2026-11-20T10:00:00Z')))

        await Effect.runPromise(
            insertMessage(supabase, 'user-1', { conversationId: ID, role: 'user', content: 'hi' })
        )

        expect(calls[0]?.payload).toEqual({
            user_id: 'user-1',
            conversation_id: ID,
            role: 'user',
            content: 'hi',
            model: null,
            prompt_tokens: null,
            completion_tokens: null,
        })
    })

    it('takeMessageSlot calls the database function with the local day and the cap', async () => {
        const { rpc, client } = makeRpcClient(() => ({ data: true, error: null }))

        expect(await Effect.runPromise(takeMessageSlot(client, '2026-11-20', 50))).toBe(true)

        expect(rpc).toHaveBeenCalledWith('coach_take_message_slot', {
            p_day: '2026-11-20',
            p_cap: 50,
        })
    })

    it('takeMessageSlot returns false at the cap and fails on thrown, returned and malformed', async () => {
        const full = makeRpcClient(() => ({ data: false, error: null }))
        expect(await Effect.runPromise(takeMessageSlot(full.client, 'd', 50))).toBe(false)

        const hashes = new Set<unknown>()
        const outcomes: RpcOutcome[] = [
            new Error('boom'),
            { data: null, error: { code: '42501', message: 'denied' } },
            { data: 'yes', error: null },
        ]
        for (const outcome of outcomes) {
            const { client } = makeRpcClient(() => outcome)
            // oxlint-disable-next-line no-await-in-loop -- three sequential cases
            const exit = await Effect.runPromiseExit(takeMessageSlot(client, 'd', 50))
            expect(failureTag(exit)).toBe('CoachWriteError')
            hashes.add(JSON.stringify(exit))
        }
        expect(hashes.size).toBe(3)
    })

    it('fails with the thrown, returned and parse branches of every call', async () => {
        const cases: Array<
            [
                string,
                (
                    db: ReturnType<typeof makeFakeAdminDb>
                ) => Effect.Effect<unknown, { _tag: string }>,
                string,
            ]
        > = [
            ['select', (db) => selectLatestMessages(db.supabase, 'u', ID, 200), 'CoachQueryError'],
            [
                'insert',
                (db) =>
                    insertMessage(db.supabase, 'u', {
                        conversationId: ID,
                        role: 'user',
                        content: 'x',
                    }),
                'CoachWriteError',
            ],
        ]
        for (const [name, run, tag] of cases) {
            const thrown = makeFakeAdminDb(() => new Error('boom'))
            const returned = makeFakeAdminDb(() => DENIED)
            const malformed = makeFakeAdminDb(() => ok([{ nope: 1 }]))
            const hashes = new Set<unknown>()
            for (const db of [thrown, returned, malformed]) {
                const exit = await Effect.runPromiseExit(run(db))
                expect(failureTag(exit), name).toBe(tag)
                hashes.add(JSON.stringify(exit))
            }
            expect(hashes.size, name).toBe(3)
        }
    })
})
