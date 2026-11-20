import { describe, expect, it } from 'vitest'
import { COACH_MODELS, coachModelLabel } from '@/_bff/core/constants/coach-models.constants'

describe('COACH_MODELS', () => {
    it('lists the exact ids in order', () => {
        expect(COACH_MODELS.map((m) => m.id)).toEqual([
            //'gemini-4-hydrogen',
            //'gemini-3.8-flash',
            'gemini-3.6-flash',
            'gemini-3-flash-preview',
            'gemini-3.5-flash-lite',
            'gemini-3.1-flash-lite',
            'gemini-2.5-flash-lite',
        ])
    })

    it('has unique ids and unique non-empty labels', () => {
        const ids = COACH_MODELS.map((m) => m.id)
        const labels = COACH_MODELS.map((m) => m.label)
        expect(new Set(ids).size).toBe(ids.length)
        expect(new Set(labels).size).toBe(labels.length)
        for (const label of labels) expect(label.length).toBeGreaterThan(0)
    })

    it('does not include the deprecated gemini-2.5-flash', () => {
        expect(COACH_MODELS.some((m) => m.id === 'gemini-2.5-flash')).toBe(false)
    })
})

describe('coachModelLabel', () => {
    it('returns the friendly name of a listed id', () => {
        expect(coachModelLabel('gemini-3.8-flash')).toBe('Gemini 3.8 Flash')
    })

    it('returns an unknown id unchanged', () => {
        expect(coachModelLabel('some-future-model')).toBe('some-future-model')
    })
})
