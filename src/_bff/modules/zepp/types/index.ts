import type { ParsedActivity } from '@/_bff/modules/training/types'
import type { HrSample } from '@/_bff/modules/training/types/progress'

// A parsed JSON body, before any schema has looked at it.
export type ZeppJson = null | boolean | number | string | ZeppJson[] | { [key: string]: ZeppJson }

export type ZeppRunSummary = {
    trackId: string
    source: string
    sportType: number
    distanceM: number
    movingTimeS: number
    endTimeS: number
    avgHrBpm: number | null
    maxHrBpm: number | null
    calories: number | null
    sportTitle: string | null
}

// The raw delta encoded series of a workout detail, `dt,value` entries separated by `;`.
export type ZeppRunDetail = {
    trackId: string
    heartRate: string
    distance: string
    speed: string
    // One `;` separated entry per full kilometre (see `decodeKiloPace`).
    kiloPace: string
}

export type ZeppHistory = { summaries: ZeppRunSummary[]; next: number }

// The Roxcoach activity of a Zepp run. The histograms are built from `samples` by the training
// import, which owns that logic.
export type AdaptedActivity = Omit<ParsedActivity, 'format' | 'hrHistogram' | 'paceHistogram'> & {
    samples: HrSample[]
}

export type ZeppConnectionRecord = { encryptedAppToken: string; lastSyncedAt: string | null }

export type ZeppConnectionStatus = { connected: boolean; lastSyncedAt: string | null }
