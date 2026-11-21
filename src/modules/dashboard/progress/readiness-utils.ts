import { RACE_READINESS } from '@/_bff/core/constants/race-readiness.constants'
import { formatPaceSeconds } from '@/_bff/core/utils/formatters.utils'
import type { ReadinessState, RunReadinessDTO } from '@/_bff/modules/training/types/progress'

const STATE_LABELS: Record<ReadinessState, string> = {
    on_track: 'On track',
    attention: 'Needs attention',
    no_data: 'No data',
    taper: 'Taper',
}

export const stateLabel = (state: ReadinessState) => STATE_LABELS[state]

// The numbers behind the Load verdict, plus what to fix when it needs attention.
export function loadReason(load: RunReadinessDTO['load']): string {
    if (load.state === 'no_data') return 'No runs in the last 4 weeks.'

    const parts = [`${Math.round(load.weeklyKm)} km/week`]
    if (load.previousWeeklyKm !== null && load.previousWeeklyKm > 0) {
        const change = Math.round((load.weeklyKm / load.previousWeeklyKm - 1) * 100)
        parts.push(`${change >= 0 ? '+' : ''}${change}% vs the 4 weeks before`)
    }
    if (load.easySharePct !== null) parts.push(`${load.easySharePct}% of the time in Z1 and Z2`)

    const notes: string[] = []
    if (load.state === 'attention') {
        if (load.ratio !== null && load.ratio > RACE_READINESS.RATIO_MAX)
            notes.push('Volume is ramping up fast.')
        if (load.ratio !== null && load.ratio < RACE_READINESS.RATIO_MIN)
            notes.push('Volume is dropping.')
        if (load.easySharePct !== null && load.easySharePct < RACE_READINESS.EASY_SHARE_MIN * 100)
            notes.push(`Aim for ${RACE_READINESS.EASY_SHARE_MIN * 100}% or more in Z1 and Z2.`)
    }
    if (load.state === 'taper') notes.push('Taper: less volume is expected now.')

    return [`${parts.join(', ')}.`, ...notes].join(' ')
}

// The numbers behind the Pace verdict: runs with work faster than the race pace.
export function paceReason(pace: RunReadinessDTO['pace'], racePaceSPerKm: number): string {
    if (pace.state === 'no_data') return 'Add runs with pace data to see your speed work.'

    const target = RACE_READINESS.FAST_SESSIONS_TARGET
    const runs = pace.fastSessions === 1 ? 'run' : 'runs'
    const base = `${pace.fastSessions} ${runs} faster than ${formatPaceSeconds(racePaceSPerKm)} in the last 4 weeks`
    if (pace.state === 'attention') return `${base}, aim for ${target}.`
    if (pace.state === 'taper') return `${base}. Taper: no need for more fast work.`
    return `${base}.`
}
