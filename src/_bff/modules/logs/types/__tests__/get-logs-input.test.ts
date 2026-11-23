import { describe, expect, it } from 'vitest'
import { getLogsInputSchema } from '@/_bff/modules/logs/types'

describe('getLogsInputSchema', () => {
    it('accepts a known range with an optional trimmed search', () => {
        expect(getLogsInputSchema.parse({ range: '7d', search: '  sync  ' })).toEqual({
            range: '7d',
            search: 'sync',
        })
        expect(getLogsInputSchema.parse({ range: '30m' })).toEqual({ range: '30m' })
    })

    it('rejects a range outside the list', () => {
        expect(getLogsInputSchema.safeParse({ range: '1y' }).success).toBe(false)
    })

    it('rejects a search longer than 200 characters', () => {
        expect(getLogsInputSchema.safeParse({ range: '1h', search: 'a'.repeat(201) }).success).toBe(
            false
        )
        expect(getLogsInputSchema.safeParse({ range: '1h', search: 'a'.repeat(200) }).success).toBe(
            true
        )
    })
})
