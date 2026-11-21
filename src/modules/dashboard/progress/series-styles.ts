import type { ZoneNumber } from '@/_bff/core/constants/hr-zones.constants'

export type SeriesMarkerKind = 'circle' | 'square' | 'diamond' | 'triangle' | 'cross'

export type SeriesStyle = { color: string; dash: string | undefined; marker: SeriesMarkerKind }

export const PACE_COLOR = 'var(--color-blue)'
export const GOAL_COLOR = 'var(--color-tangerine)'
export const GRID_COLOR = 'var(--color-hairline)'
export const AXIS_COLOR = 'var(--color-muted-foreground)'

// Each zone differs by color, dash and marker, so none relies on color alone.
export const ZONE_STYLES: Record<ZoneNumber, SeriesStyle> = {
    1: { color: 'var(--color-slate)', dash: undefined, marker: 'circle' },
    2: { color: 'var(--color-blue)', dash: undefined, marker: 'square' },
    3: { color: 'var(--color-green)', dash: undefined, marker: 'diamond' },
    4: { color: 'var(--color-tangerine)', dash: undefined, marker: 'triangle' },
    5: { color: 'var(--color-tangerine-deep)', dash: '4 3', marker: 'cross' },
}

// One style per exercise line, up to the five the dashboard shows. Color, dash and marker all
// differ, so no line relies on color alone.
export const SERIES_STYLES: SeriesStyle[] = [
    { color: 'var(--color-blue)', dash: undefined, marker: 'circle' },
    { color: 'var(--color-green)', dash: undefined, marker: 'square' },
    { color: 'var(--color-tangerine)', dash: undefined, marker: 'diamond' },
    { color: 'var(--color-slate)', dash: undefined, marker: 'triangle' },
    { color: 'var(--color-tangerine-deep)', dash: '4 3', marker: 'cross' },
]
