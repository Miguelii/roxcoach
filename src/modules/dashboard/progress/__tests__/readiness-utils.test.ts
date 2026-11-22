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
        expect(loadReason({ ...load, state: 'attention', easySharePct: 50 })).toContain('75%')
    })

    it('handles no data and the taper', () => {
        expect(loadReason({ ...load, state: 'no_data' })).toContain('No runs')
        expect(loadReason({ ...load, state: 'taper' })).toContain('Taper')
    })
})

describe('paceReason', () => {
    const pace = {
        state: 'attention' as const,
        fastSessions: 2,
        hardLast7Days: 1,
        backToBack: false,
        fastTimeS: 500,
    }

    it('counts the hard runs against the race pace and the weekly target', () => {
        const text = paceReason(pace, 276)
        expect(text).toContain('2 runs')
        expect(text).toContain('4:36 /km or faster')
        expect(text).toContain('aim for 1 to 2 a week')
    })

    it('says to ease off after too many hard runs or back to back ones', () => {
        expect(paceReason({ ...pace, fastSessions: 5, hardLast7Days: 3 }, 276)).toContain(
            '3 hard runs in the last 7 days, max 2'
        )
        expect(paceReason({ ...pace, fastSessions: 5, backToBack: true }, 276)).toContain(
            'back to back'
        )
    })

    it('uses the singular and drops the target when on track', () => {
        expect(paceReason({ ...pace, state: 'on_track', fastSessions: 1 }, 276)).toContain('1 run ')
        expect(paceReason({ ...pace, state: 'on_track', fastSessions: 4 }, 276)).not.toContain(
            'aim for'
        )
    })

    it('asks for pace data when there is none', () => {
        expect(paceReason({ ...pace, state: 'no_data' }, 276)).toContain('pace data')
    })
})
