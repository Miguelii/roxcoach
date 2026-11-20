// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildHistory } from '@/_bff/modules/coach/helpers/build-history.helper'
import type { MessageDTO } from '@/_bff/modules/coach/types'

const msg = (index: number, role: MessageDTO['role'], content = `m${index}`): MessageDTO => ({
    id: `id-${index}`,
    role,
    content,
    createdAt: `2026-11-20T10:${String(index % 60).padStart(2, '0')}:00Z`,
})

describe('buildHistory', () => {
    it('returns an empty list for no messages', () => {
        expect(buildHistory([])).toEqual([])
    })

    it('keeps the order and drops ids and dates', () => {
        expect(buildHistory([msg(1, 'user'), msg(2, 'assistant'), msg(3, 'user')])).toEqual([
            { role: 'user', content: 'm1' },
            { role: 'assistant', content: 'm2' },
            { role: 'user', content: 'm3' },
        ])
    })

    it('merges consecutive user turns with a blank line', () => {
        expect(buildHistory([msg(1, 'user'), msg(2, 'user'), msg(3, 'user')])).toEqual([
            { role: 'user', content: 'm1\n\nm2\n\nm3' },
        ])
        expect(
            buildHistory([msg(1, 'user'), msg(2, 'assistant'), msg(3, 'user'), msg(4, 'user')])
        ).toEqual([
            { role: 'user', content: 'm1' },
            { role: 'assistant', content: 'm2' },
            { role: 'user', content: 'm3\n\nm4' },
        ])
    })

    it('keeps a trailing assistant message', () => {
        const history = buildHistory([msg(1, 'user'), msg(2, 'assistant')])
        expect(history.at(-1)).toEqual({ role: 'assistant', content: 'm2' })
    })

    it('windows to the last 20 messages', () => {
        const messages = Array.from({ length: 30 }, (_, i) =>
            msg(i + 1, i % 2 === 0 ? 'user' : 'assistant')
        )
        const history = buildHistory(messages)
        expect(history).toHaveLength(20)
        expect(history[0]).toEqual({ role: 'user', content: 'm11' })
        expect(history.at(-1)).toEqual({ role: 'assistant', content: 'm30' })
    })

    it('drops leading assistant messages left by the window', () => {
        // 21 messages ending with a user turn: the window of 20 starts with an assistant turn.
        const messages = Array.from({ length: 21 }, (_, i) =>
            msg(i + 1, i % 2 === 0 ? 'user' : 'assistant')
        )
        expect(messages.slice(-20)[0]?.role).toBe('assistant')
        const history = buildHistory(messages)
        expect(history[0]).toEqual({ role: 'user', content: 'm3' })
        expect(history).toHaveLength(19)
        expect(history.at(-1)).toEqual({ role: 'user', content: 'm21' })
    })
})
