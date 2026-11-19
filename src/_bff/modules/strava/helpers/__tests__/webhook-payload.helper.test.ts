import { describe, expect, it } from 'vitest'
import { parseWebhookPayload } from '@/_bff/modules/strava/helpers/webhook-payload.helper'

const valid = {
    object_type: 'activity',
    object_id: 987654321,
    aspect_type: 'create',
    owner_id: 12345,
    event_time: 1763460000,
}

describe('parseWebhookPayload', () => {
    it('accepts a valid event and keeps only the known fields', () => {
        const result = parseWebhookPayload({ ...valid, subscription_id: 1, extra: 'x' })
        expect(result).toEqual({ ok: true, event: valid })
    })

    it('keeps string updates and drops non-string ones', () => {
        const result = parseWebhookPayload({
            ...valid,
            object_type: 'athlete',
            aspect_type: 'update',
            updates: { authorized: 'false', private: true },
        })
        expect(result).toEqual({
            ok: true,
            event: {
                ...valid,
                object_type: 'athlete',
                aspect_type: 'update',
                updates: { authorized: 'false' },
            },
        })
    })

    it.each([
        ['null', null],
        ['an array', []],
        ['a string', 'x'],
        ['a missing object_id', { ...valid, object_id: undefined }],
        ['a string id', { ...valid, object_id: '1' }],
        ['a zero id', { ...valid, owner_id: 0 }],
        ['a negative id', { ...valid, object_id: -1 }],
        ['a fractional id', { ...valid, object_id: 1.5 }],
        ['an unsafe id', { ...valid, object_id: Number.MAX_SAFE_INTEGER + 1 }],
        ['a zero event_time', { ...valid, event_time: 0 }],
        ['a numeric object_type', { ...valid, object_type: 1 }],
        ['a missing aspect_type', { ...valid, aspect_type: undefined }],
    ])('rejects %s', (_name, body) => {
        expect(parseWebhookPayload(body)).toEqual({ ok: false })
    })
})
