import type { ZoneNumber } from '@/_bff/core/constants/hr-zones.constants'

export type SeriesMarkerKind = 'circle' | 'square' | 'diamond' | 'triangle' | 'cross'

type SeriesStyle = { color: string; dash: string | undefined; marker: SeriesMarkerKind }

export const PACE_COLOR = 'var(--color-blue)'
export const HEART_RATE_COLOR = 'var(--color-tangerine)'
export const VOLUME_COLOR = 'var(--color-green)'
export const FREQUENCY_COLOR = 'var(--color-slate)'
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
