'use client'

import { useId, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { formatClock } from '@/_bff/core/utils/formatters.utils'
import { kmTicks, niceTicks, smoothPath, type ChartPoint } from '@/modules/activity/run-chart-utils'

type Kind = 'pace' | 'hr'

type Props = {
    testId: string
    label: string
    kind: Kind
    points: ChartPoint[]
}

type Config = {
    // CSS color of the line, the fill and the tooltip.
    color: string
    yStep: number
    unit: string
    // Pace is read "faster is higher": the axis grows downward.
    invert: boolean
    axis: (value: number) => string
    tooltip: (value: number) => string
}

type Cursor = { km: number; value: number; x: number; y: number }

const DASH = '-'
const WIDTH = 640
const HEIGHT = 250
const PAD = { top: 12, right: 12, bottom: 30, left: 52 }
const KM_FORMATTER = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
})

const CONFIG: Record<Kind, Config> = {
    pace: {
        color: 'var(--color-blue)',
        yStep: 15,
        unit: '/km',
        invert: true,
        axis: (value) => formatClock(value) ?? DASH,
        tooltip: (value) => `${formatClock(value) ?? DASH} /km`,
    },
    hr: {
        color: 'var(--color-destructive)',
        yStep: 10,
        unit: 'bpm',
        invert: false,
        axis: (value) => String(Math.round(value)),
        tooltip: (value) => `${Math.round(value)} bpm`,
    },
}

// Strava-style area chart over distance. Press or drag on it to read the value at that point.
export function RunAreaChart({ testId, label, kind, points }: Props) {
    const { color, yStep, unit, invert, axis, tooltip } = CONFIG[kind]
    const gradientId = useId()
    const pathRef = useRef<SVGPathElement>(null)
    const [cursor, setCursor] = useState<Cursor | null>(null)

    const ys = points.map((point) => point.y)
    const ticks = niceTicks(Math.min(...ys) - yStep * 0.5, Math.max(...ys) + yStep * 0.5, yStep)
    const yMin = ticks[0]!
    const yMax = ticks.at(-1)!
    const totalKm = points.at(-1)!.x

    const plotW = WIDTH - PAD.left - PAD.right
    const plotH = HEIGHT - PAD.top - PAD.bottom
    const sx = (km: number) => PAD.left + (km / totalKm) * plotW
    const unitY = (value: number) => (value - yMin) / (yMax - yMin)
    const sy = (value: number) => PAD.top + (invert ? unitY(value) : 1 - unitY(value)) * plotH
    const baseline = PAD.top + plotH

    const scaled = points.map((point) => ({ x: sx(point.x), y: sy(point.y) }))
    const line = smoothPath(scaled)
    const area = `${line}L${sx(totalKm)},${baseline}L${sx(0)},${baseline}Z`

    // Finds the point of the drawn curve at a screen x by bisecting along the path, so the dot
    // always sits on the line.
    const readAt = (event: PointerEvent<SVGSVGElement>) => {
        const path = pathRef.current
        if (!path) return
        const rect = event.currentTarget.getBoundingClientRect()
        const x = Math.min(
            Math.max(((event.clientX - rect.left) / rect.width) * WIDTH, sx(0)),
            sx(totalKm)
        )
        let low = 0
        let high = path.getTotalLength()
        for (let i = 0; i < 24; i++) {
            const mid = (low + high) / 2
            if (path.getPointAtLength(mid).x < x) low = mid
            else high = mid
        }
        const hit = path.getPointAtLength(high)
        const ratio = (baseline - hit.y) / plotH
        const unit01 = invert ? 1 - ratio : ratio
        setCursor({
            km: ((hit.x - PAD.left) / plotW) * totalKm,
            value: yMin + unit01 * (yMax - yMin),
            x: hit.x,
            y: hit.y,
        })
    }

    const tooltipLeft = cursor ? Math.min(Math.max((cursor.x / WIDTH) * 100, 14), 86) : 0

    return (
        <div className="relative">
            <svg
                data-testid={testId}
                role="img"
                aria-label={label}
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                className="h-auto w-full cursor-crosshair touch-pan-y select-none overflow-visible"
                onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId)
                    readAt(event)
                }}
                onPointerMove={readAt}
                onPointerLeave={(event) => {
                    if (event.pointerType === 'mouse') setCursor(null)
                }}
            >
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.55" />
                        <stop offset="100%" stopColor={color} stopOpacity="0.12" />
                    </linearGradient>
                </defs>

                {ticks.map((tick) => (
                    <g key={tick}>
                        <line
                            x1={PAD.left}
                            x2={WIDTH - PAD.right}
                            y1={sy(tick)}
                            y2={sy(tick)}
                            stroke="var(--color-hairline)"
                        />
                        <text
                            x={PAD.left - 10}
                            y={sy(tick)}
                            textAnchor="end"
                            dominantBaseline="central"
                            className="fill-muted-foreground font-mono text-[11px]"
                        >
                            {axis(tick)}
                        </text>
                    </g>
                ))}

                {kmTicks(totalKm).map((km) => (
                    <g key={km}>
                        <line
                            x1={sx(km)}
                            x2={sx(km)}
                            y1={PAD.top}
                            y2={baseline}
                            stroke="var(--color-hairline)"
                        />
                        <text
                            x={sx(km)}
                            y={baseline + 18}
                            textAnchor="middle"
                            className="fill-muted-foreground font-mono text-[11px]"
                        >
                            {km} km
                        </text>
                    </g>
                ))}

                <text
                    x={PAD.left - 10}
                    y={baseline + 18}
                    textAnchor="end"
                    className="fill-muted-foreground font-mono text-[11px]"
                >
                    {unit}
                </text>

                <path d={area} fill={`url(#${gradientId})`} />
                <path
                    ref={pathRef}
                    d={line}
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />

                {cursor && (
                    <g data-testid={`${testId}-cursor`} pointerEvents="none">
                        <line
                            x1={cursor.x}
                            x2={cursor.x}
                            y1={PAD.top}
                            y2={baseline}
                            stroke="var(--color-ink)"
                            strokeWidth="2"
                        />
                        <circle
                            cx={cursor.x}
                            cy={cursor.y}
                            r="9"
                            fill="var(--color-ink)"
                            fillOpacity="0.15"
                        />
                        <circle cx={cursor.x} cy={cursor.y} r="5" fill="var(--color-ink)" />
                    </g>
                )}
            </svg>

            {cursor && (
                <div
                    data-testid={`${testId}-tooltip`}
                    role="status"
                    className="pointer-events-none absolute top-0 -translate-x-1/2 -translate-y-[calc(100%-0.25rem)] rounded-2xl px-4 py-2 text-white shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)]"
                    style={{ left: `${tooltipLeft}%`, backgroundColor: color }}
                >
                    <p className="display text-xl leading-tight">{tooltip(cursor.value)}</p>
                    <p className="text-xs opacity-85">{KM_FORMATTER.format(cursor.km)} km</p>
                </div>
            )}
        </div>
    )
}
