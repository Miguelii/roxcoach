// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { TRPCError } from '@trpc/server'
import { appRouter } from '@/_bff/trpc/router'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    CoachQueryError,
    CoachWriteError,
    ConversationNotFoundError,
    CreateSbClientError,
} from '@/_bff/lib/errors'

const mocks = vi.hoisted(() => ({
    listConversations: vi.fn(),
    getConversationMessages: vi.fn(),
    deleteConversation: vi.fn(),
    getSession: vi.fn(),
}))

vi.mock('@/_bff/modules/coach/services/list-conversations.service', () => ({
    listConversations: mocks.listConversations,
}))
vi.mock('@/_bff/modules/coach/services/get-conversation-messages.service', () => ({
    getConversationMessages: mocks.getConversationMessages,
}))
vi.mock('@/_bff/modules/coach/services/delete-conversation.service', () => ({
    deleteConversation: mocks.deleteConversation,
}))
vi.mock('@/_bff/modules/auth/services/get-session.service', () => ({
    getSession: mocks.getSession,
}))
vi.mock('@/_bff/modules/auth/services/get-cached-claims.service', () => ({
    getCachedClaims: vi.fn().mockResolvedValue(null),
}))

const USER = { id: 'user-1', app_metadata: { roxcoach: true } }
const caller = appRouter.createCaller({})
const ID = '11111111-1111-4111-8111-111111111111'
const code = ErrorCode.COACH_CONVERSATION_NOT_FOUND

const caught = async (promise: Promise<unknown>): Promise<TRPCError> => {
    try {
        await promise
    } catch (error) {
        if (error instanceof TRPCError) return error
    }
    throw new Error('expected a TRPCError')
}

describe('coach controllers', () => {
    beforeEach(() => {
        for (const mock of Object.values(mocks)) mock.mockReset()
        mocks.getSession.mockReturnValue(Effect.succeed(USER))
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    it('list, get and delete call their services with the user and return the result', async () => {
        const conversation = { id: ID, title: 'Hi', updatedAt: '2026-11-20T10:00:00Z' }
        const message = {
            id: 'm1',
            role: 'user',
            content: 'a',
            model: null,
            createdAt: '2026-11-20T10:00:00Z',
        }
        mocks.listConversations.mockReturnValue(Effect.succeed([conversation]))
        mocks.getConversationMessages.mockReturnValue(Effect.succeed([message]))
        mocks.deleteConversation.mockReturnValue(Effect.succeed({ id: ID }))

        await expect(caller.coach.listConversations()).resolves.toEqual([conversation])
        await expect(caller.coach.getConversationMessages({ conversationId: ID })).resolves.toEqual(
            [message]
        )
        await expect(caller.coach.deleteConversation({ conversationId: ID })).resolves.toEqual({
            id: ID,
        })
        expect(mocks.listConversations).toHaveBeenCalledWith(USER)
        expect(mocks.getConversationMessages).toHaveBeenCalledWith(USER, ID)
        expect(mocks.deleteConversation).toHaveBeenCalledWith(USER, ID)
    })

    it('rejects a non-uuid conversation id before any service runs', async () => {
        const errors = await Promise.all([
            caught(caller.coach.getConversationMessages({ conversationId: 'nope' })),
            caught(caller.coach.deleteConversation({ conversationId: 'nope' })),
        ])

        expect(errors.map((error) => error.code)).toEqual(['BAD_REQUEST', 'BAD_REQUEST'])
        expect(mocks.getConversationMessages).not.toHaveBeenCalled()
        expect(mocks.deleteConversation).not.toHaveBeenCalled()
    })

    it('maps not found to NOT_FOUND and the rest to 500 without forwarding the cause', async () => {
        mocks.getConversationMessages.mockReturnValue(
            Effect.fail(new ConversationNotFoundError({ cause: 'secret', error_hash: code }))
        )
        mocks.deleteConversation.mockReturnValue(
            Effect.fail(new ConversationNotFoundError({ cause: 'secret', error_hash: code }))
        )
        mocks.listConversations.mockReturnValue(
            Effect.fail(new CoachQueryError({ cause: '42501: denied', error_hash: code }))
        )

        const errors = await Promise.all([
            caught(caller.coach.getConversationMessages({ conversationId: ID })),
            caught(caller.coach.deleteConversation({ conversationId: ID })),
            caught(caller.coach.listConversations()),
        ])
        expect(errors.map((error) => error.code)).toEqual([
            'NOT_FOUND',
            'NOT_FOUND',
            'INTERNAL_SERVER_ERROR',
        ])
        expect(errors.every((error) => error.cause === undefined)).toBe(true)
        expect(errors.every((error) => !error.message.includes('denied'))).toBe(true)

        mocks.deleteConversation.mockReturnValue(
            Effect.fail(new CoachWriteError({ cause: 'x', error_hash: code }))
        )
        mocks.listConversations.mockReturnValue(
            Effect.fail(new CreateSbClientError({ cause: 'x', error_hash: code }))
        )
        expect((await caught(caller.coach.deleteConversation({ conversationId: ID }))).code).toBe(
            'INTERNAL_SERVER_ERROR'
        )
        expect((await caught(caller.coach.listConversations())).code).toBe('INTERNAL_SERVER_ERROR')
    })
})
