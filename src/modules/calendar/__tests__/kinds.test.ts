import { describe, expect, it } from 'vitest'
import { KINDS } from '@/modules/calendar/kinds'

describe('KINDS', () => {
    it('colours Hyrox with the signal tone', () => {
        expect(KINDS.hyrox.tone).toBe('signal')
    })

    it('keeps run blue and strength plum', () => {
        expect(KINDS.run.tone).toBe('blue')
        expect(KINDS.strength.tone).toBe('plum')
    })
})
