import { LOG_RANGES, type LogLevel, type LogRange } from '@/_bff/core/constants/logs.constants'

export const LOG_RANGE_OPTIONS: { value: LogRange; label: string }[] = LOG_RANGES.map((value) => ({
    value,
    label: value,
}))

export const LOG_LEVEL_LABEL: Record<LogLevel, string> = {
    error: 'Error',
    warn: 'Warning',
    info: 'Info',
    debug: 'Debug',
}

// Soft fill with the deep shade of the same hue for the text on it.
export const LOG_LEVEL_BADGE_CLASS: Record<LogLevel, string> = {
    error: 'bg-red-soft text-red-deep',
    warn: 'bg-amber-soft text-amber-deep',
    info: 'bg-blue-soft text-blue-deep',
    debug: 'bg-slate-soft text-slate-deep',
}

export const LOG_LEVEL_CHART_COLOR: Record<LogLevel, string> = {
    error: 'var(--color-red)',
    warn: 'var(--color-amber)',
    info: 'var(--color-blue)',
    debug: 'var(--color-slate)',
}

export const SEARCH_DEBOUNCE_MS = 400
