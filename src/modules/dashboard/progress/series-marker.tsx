import type { SeriesMarkerKind } from '@/modules/dashboard/progress/series-styles'

type Props = {
    kind: SeriesMarkerKind
    color: string
    // Center of the marker, in the coordinates of the surrounding SVG.
    x?: number
    y?: number
}

const R = 4

// The same small kind in the chart (as a point) and in the legend (as a swatch).
export function SeriesMarker({ kind, color, x = 0, y = 0 }: Props) {
    const at = `translate(${x} ${y})`
    if (kind === 'circle') return <circle transform={at} r={R} fill={color} />
    if (kind === 'square')
        return <rect transform={at} x={-R} y={-R} width={R * 2} height={R * 2} fill={color} />
    if (kind === 'diamond')
        return (
            <polygon
                transform={at}
                points={`0,${-R - 1} ${R + 1},0 0,${R + 1} ${-R - 1},0`}
                fill={color}
            />
        )
    if (kind === 'triangle')
        return (
            <polygon
                transform={at}
                points={`0,${-R - 1} ${R + 1},${R} ${-R - 1},${R}`}
                fill={color}
            />
        )
    return (
        <path
            transform={at}
            d={`M${-R} ${-R} L${R} ${R} M${R} ${-R} L${-R} ${R}`}
            stroke={color}
            strokeWidth={2}
            fill="none"
        />
    )
}
