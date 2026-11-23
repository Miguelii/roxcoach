import { describe, expect, it } from 'vitest'
import { zeppSyncResultSchema } from '@/_bff/core/constants/zepp.constants'

describe('zeppSyncResultSchema', () => {
    it('accepts the stored Zepp sync result and rejects anything else', () => {
        const stored = { imported: 3, skipped: 1, updated: 2, remaining: 0 }

        expect(zeppSyncResultSchema.safeParse(stored)).toEqual({ success: true, data: stored })
        expect(zeppSyncResultSchema.safeParse({ ...stored, imported: 1.5 }).success).toBe(false)
        expect(zeppSyncResultSchema.safeParse({ ...stored, remaining: -1 }).success).toBe(false)
        expect(zeppSyncResultSchema.safeParse({ imported: 1 }).success).toBe(false)
        expect(zeppSyncResultSchema.safeParse(null).success).toBe(false)
    })
})
