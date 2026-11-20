// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import type { User } from '@supabase/supabase-js'
import { failureTag } from '@/_bff/lib/tests-utils'
import { makeFakeAdminDb, ok, type Call } from '@/_bff/lib/fake-admin-db'
import { countUserMessagesToday } from '@/_bff/modules/coach/services/count-messages-today.service'
import { deleteConversation } from '@/_bff/modules/coach/services/delete-conversation.service'
import { getConversationMessages } from '@/_bff/modules/coach/services/get-conversation-messages.service'
import { listConversations } from '@/_bff/modules/coach/services/list-conversations.service'

const { createDBServerClientMock } = vi.hoisted(() => ({ createDBServerClientMock: vi.fn() }))

vi.mock('@/_bff/core/db', () => ({ createDBServerClient: createDBServerClientMock }))

// SAFETY: the services only read `user.id`.
const USER = { id: 'user-1' } as User
const ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'

const filterValue = (call: Call, column: string) =>
    call.filters.find(([name]) => name === column)?.[1]

// Two athletes' data: conversations and messages, matched by every id and user_id filter.
const setup = () => {
    const conversations = [
        { id: ID, title: 'Mine', updated_at: '2026-11-20T10:00:00Z', user_id: 'user-1' },
        { id: OTHER_ID, title: 'Theirs', updated_at: '2026-11-20T10:00:00Z', user_id: 'user-2' },
    ]
    const messages = [
        {
            id: 'm1',
            role: 'user',
            content: 'a',
            created_at: '2026-11-20T10:01:00Z',
            conversation_id: ID,
            user_id: 'user-1',
        },
        {
            id: 'm2',
            role: 'assistant',
            content: 'b',
            created_at: '2026-11-20T10:02:00Z',
            conversation_id: ID,
            user_id: 'user-1',
        },
        {
            id: 'm3',
            role: 'user',
            content: 'c',
            created_at: '2026-11-20T10:03:00Z',
            conversation_id: OTHER_ID,
            user_id: 'user-2',
        },
    ]
    const db = makeFakeAdminDb((call: Call) => {
        const user = filterValue(call, 'user_id')
        if (call.table === 'coach_messages') {
            return ok(
                messages
                    .filter(
                        (row) =>
                            row.conversation_id === filterValue(call, 'conversation_id') &&
                            row.user_id === user
                    )
                    .reverse()
            )
        }
        const match = conversations.filter(
            (row) =>
                row.user_id === user &&
                (!filterValue(call, 'id') || row.id === filterValue(call, 'id'))
        )
        if (call.op === 'delete') return ok(match.map((row) => ({ id: row.id })))
        if (filterValue(call, 'id')) return ok(match[0] ?? null)
        return ok(match)
    })
    createDBServerClientMock.mockResolvedValue(db.supabase)
    return db
}

describe('coach conversation services', () => {
    beforeEach(() => {
        createDBServerClientMock.mockReset()
    })

    it('listConversations returns only the athlete conversations, limited to 30', async () => {
        const { calls } = setup()

        const list = await Effect.runPromise(listConversations(USER))

        expect(list).toEqual([{ id: ID, title: 'Mine', updatedAt: '2026-11-20T10:00:00Z' }])
        expect(filterValue(calls[0]!, 'limit')).toBe(30)
    })

    it('getConversationMessages returns the messages oldest first, limited to 200', async () => {
        const { calls } = setup()

        const list = await Effect.runPromise(getConversationMessages(USER, ID))

        expect(list.map((row) => row.id)).toEqual(['m1', 'm2'])
        expect(filterValue(calls[1]!, 'limit')).toBe(200)
    })

    it('getConversationMessages: another athlete and a missing id fail identically, with no data', async () => {
        const { calls } = setup()

        const other = await Effect.runPromiseExit(getConversationMessages(USER, OTHER_ID))
        const missing = await Effect.runPromiseExit(
            getConversationMessages(USER, '33333333-3333-4333-8333-333333333333')
        )

        expect(failureTag(other)).toBe('ConversationNotFoundError')
        expect(failureTag(missing)).toBe('ConversationNotFoundError')
        expect(JSON.stringify(other)).toBe(JSON.stringify(missing))
        // The messages are never read once the conversation is not the athlete's.
        expect(calls.some((call) => call.table === 'coach_messages')).toBe(false)
    })

    it('deleteConversation removes the own conversation and not found for another athlete', async () => {
        const { calls } = setup()

        expect(await Effect.runPromise(deleteConversation(USER, ID))).toEqual({ id: ID })
        expect(failureTag(await Effect.runPromiseExit(deleteConversation(USER, OTHER_ID)))).toBe(
            'ConversationNotFoundError'
        )
        expect(calls.every((call) => filterValue(call, 'user_id') === 'user-1')).toBe(true)
    })

    it('maps a failing client creation to CreateSbClientError', async () => {
        createDBServerClientMock.mockImplementation(() => Promise.reject(new Error('no cookies')))

        expect(failureTag(await Effect.runPromiseExit(listConversations(USER)))).toBe(
            'CreateSbClientError'
        )
    })

    it('countUserMessagesToday uses different intervals for Lisbon and Auckland at the same instant', async () => {
        const db = makeFakeAdminDb(() => ({ data: null, count: 3, error: null }))
        createDBServerClientMock.mockResolvedValue(db.supabase)
        const now = new Date('2026-11-20T23:30:00Z')

        expect(await Effect.runPromise(countUserMessagesToday(USER, 'Europe/Lisbon', now))).toBe(3)
        await Effect.runPromise(countUserMessagesToday(USER, 'Pacific/Auckland', now))

        const [lisbon, auckland] = db.calls
        expect(filterValue(lisbon!, 'created_at:gte')).toBe('2026-11-20T00:00:00.000Z')
        expect(filterValue(lisbon!, 'created_at:lt')).toBe('2026-11-21T00:00:00.000Z')
        expect(filterValue(auckland!, 'created_at:gte')).toBe('2026-11-20T11:00:00.000Z')
        expect(filterValue(auckland!, 'created_at:lt')).toBe('2026-11-21T11:00:00.000Z')
        expect(filterValue(lisbon!, 'role')).toBe('user')
        expect(filterValue(lisbon!, 'user_id')).toBe('user-1')
    })
})
