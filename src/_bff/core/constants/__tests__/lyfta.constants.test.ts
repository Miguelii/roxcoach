import { describe, expect, it } from 'vitest'
import { lyftaSyncResultSchema } from '@/_bff/core/constants/lyfta.constants'

describe('lyftaSyncResultSchema', () => {
    it('accepts the stored Lyfta sync result and rejects anything else', () => {
        expect(lyftaSyncResultSchema.safeParse({ created: 3, updated: 1, hasMore: false })).toEqual(
            {
                success: true,
                data: { created: 3, updated: 1, hasMore: false },
            }
        )
        expect(
            lyftaSyncResultSchema.safeParse({ created: 1.5, updated: 0, hasMore: false }).success
        ).toBe(false)
        expect(lyftaSyncResultSchema.safeParse({ created: 1, updated: 0 }).success).toBe(false)
        expect(lyftaSyncResultSchema.safeParse(null).success).toBe(false)
    })
})
