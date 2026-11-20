import { describe, expect, it } from 'vitest'
import type { AvailabilitySlotDTO } from '@/_bff/modules/athlete/types'
import { addSlot, removeSlot, summarize } from '@/modules/settings/use-availability-editor'

const EMPTY: AvailabilitySlotDTO[] = []

const slot = (
    weekday: number,
    sessionKind: AvailabilitySlotDTO['sessionKind'],
    isFixed = false,
    maxMinutes: number | null = 60
): AvailabilitySlotDTO => ({ weekday, sessionKind, isFixed, maxMinutes, notes: null })

describe('addSlot', () => {
    it('adds open and fixed slots', () => {
        const open = addSlot([], 1, 'run', false)
        expect(open).toEqual([slot(1, 'run', false, null)])
        const fixed = addSlot(open, 1, 'hyrox', true)
        expect(fixed).toHaveLength(2)
        expect(fixed[1]).toMatchObject({ weekday: 1, sessionKind: 'hyrox', isFixed: true })
    })

    it('ignores a second slot of the same kind on the same day', () => {
        const once = addSlot([], 2, 'run', false)
        expect(addSlot(once, 2, 'run', true)).toBe(once)
    })

    it('a rest day removes the other slots of that day only', () => {
        const start = [slot(3, 'run'), slot(3, 'strength'), slot(4, 'run')]
        expect(addSlot(start, 3, 'rest', false)).toEqual([
            slot(4, 'run'),
            { weekday: 3, sessionKind: 'rest', isFixed: false, maxMinutes: null, notes: null },
        ])
    })

    it('adding a slot to a rest day replaces the rest', () => {
        const rest = addSlot([], 5, 'rest', false)
        expect(addSlot(rest, 5, 'run', false)).toEqual([slot(5, 'run', false, null)])
    })

    it('ignores a fifth slot on one day', () => {
        const full = (['hyrox', 'run', 'strength', 'cross'] as const).reduce(
            (acc, kind) => addSlot(acc, 1, kind, false),
            EMPTY
        )
        expect(full).toHaveLength(4)
    })
})

describe('removeSlot', () => {
    it('removes one slot', () => {
        const start = [slot(1, 'run'), slot(1, 'strength')]
        expect(removeSlot(start, 1, 'run')).toEqual([slot(1, 'strength')])
    })
})

describe('summarize', () => {
    it('counts sessions without rest and rounds hours to one decimal', () => {
        const slots = [
            slot(1, 'run', false, 50),
            slot(2, 'run', false, 45),
            slot(3, 'rest', false, null),
        ]
        expect(summarize(slots)).toEqual({ sessions: 2, hours: 1.6 })
    })

    it('counts only slots with a duration and reports no hours when none has one', () => {
        expect(summarize([slot(1, 'run', false, null)])).toEqual({ sessions: 1, hours: null })
        expect(summarize([slot(1, 'run', false, 90), slot(2, 'run', false, null)])).toEqual({
            sessions: 2,
            hours: 1.5,
        })
    })
})
