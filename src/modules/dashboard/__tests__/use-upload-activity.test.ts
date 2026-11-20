import { describe, expect, it } from 'vitest'
import { detectHyroxHint } from '@/modules/dashboard/use-upload-activity'

describe('detectHyroxHint', () => {
    it('matches HYROX case-insensitively', () => {
        expect(detectHyroxHint('<Notes>my Hyrox race</Notes>')).toBe(true)
        expect(detectHyroxHint('HYROX')).toBe(true)
    })

    it('does not match other text', () => {
        expect(detectHyroxHint('<Notes>easy run</Notes>')).toBe(false)
        expect(detectHyroxHint('')).toBe(false)
    })
})
