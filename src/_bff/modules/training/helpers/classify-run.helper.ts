import type { RunType, RunTypeRules } from '@/_bff/core/constants/weekly-goals.constants'

type RunMetrics = {
    distanceM: number | null
    movingTimeS: number | null
    elapsedTimeS: number | null
}

// Twin of roxcoach.classify_run_default (migration 0025): keep both rules in step.
export const classifyRun = (run: RunMetrics, rules: RunTypeRules): RunType | null => {
    const timeS = run.movingTimeS ?? run.elapsedTimeS
    if (run.distanceM === null || run.distanceM <= 0 || run.distanceM < rules.shortRunMaxM)
        return null
    if (timeS === null || timeS <= 0) return null
    if (run.distanceM > rules.longRunMinM) return 'long'
    return timeS / (run.distanceM / 1000) < rules.fastPaceSPerKm ? 'fast' : 'long'
}
