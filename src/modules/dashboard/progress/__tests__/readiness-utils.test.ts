import { describe, expect, it } from 'vitest'
import { loadReason, paceReason, stateLabel } from '@/modules/dashboard/progress/readiness-utils'

describe('stateLabel', () => {
    it('names every state', () => {
        expect(stateLabel('on_track')).toBe('On track')
        expect(stateLabel('attention')).toBe('Needs attention')
        expect(stateLabel('no_data')).toBe('No data')
        expect(stateLabel('taper')).toBe('Taper')
    })
})

describe('loadReason', () => {
    const load = {
        state: 'on_track' as const,
        weeklyKm: 38,
        previousWeeklyKm: 36,
        ratio: 1.06,
        easySharePct: 71,
    }

    it('gives the volume, the change and the easy share', () => {
        const text = loadReason(load)
        expect(text).toContain('38 km/week')
        expect(text).toContain('+6% vs the 4 weeks before')
        expect(text).toContain('71%')
    })

    it('omits the share without zones and the change without a previous window', () => {
        const text = loadReason({ ...load, easySharePct: null, previousWeeklyKm: null })
        expect(text).not.toContain('Z1')
        expect(text).not.toContain('vs the 4 weeks')
    })

    it('says what to fix when it needs attention', () => {
        expect(loadReason({ ...load, state: 'attention', ratio: 1.6 })).toContain('ramping up fast')
        expect(loadReason({ ...load, state: 'attention', ratio: 0.5 })).toContain('dropping')
        expect(loadReason({ ...load, state: 'attention', easySharePct: 50 })).toContain('70%')
    })

    it('handles no data and the taper', () => {
        expect(loadReason({ ...load, state: 'no_data' })).toContain('No runs')
        expect(loadReason({ ...load, state: 'taper' })).toContain('Taper')
    })
})

describe('paceReason', () => {
    it('counts the fast runs against the race pace and the target', () => {
        const text = paceReason({ state: 'attention', fastSessions: 2, fastTimeS: 500 }, 276)
        expect(text).toContain('2 runs')
        expect(text).toContain('4:36 /km')
        expect(text).toContain('aim for 3')
    })

    it('uses the singular and drops the target when on track', () => {
        expect(paceReason({ state: 'on_track', fastSessions: 1, fastTimeS: 200 }, 276)).toContain(
            '1 run '
        )
        expect(
            paceReason({ state: 'on_track', fastSessions: 3, fastTimeS: 600 }, 276)
        ).not.toContain('aim for')
    })

    it('asks for pace data when there is none', () => {
        expect(paceReason({ state: 'no_data', fastSessions: 0, fastTimeS: 0 }, 276)).toContain(
            'pace data'
        )
    })
})
