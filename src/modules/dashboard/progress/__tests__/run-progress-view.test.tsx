import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { zoneBoundsBpm } from '@/_bff/core/constants/hr-zones.constants'
import type { RunBucketDTO, RunProgressDTO } from '@/_bff/modules/training/types/progress'
import { RunKpis } from '@/modules/dashboard/progress/run-kpis'
import { RunProgressView } from '@/modules/dashboard/progress/run-progress-view'

const zones = (z2: number | null, z3: number | null): RunBucketDTO['zones'] => [
    { zone: 1, paceSecPerKm: null, minutes: 0 },
    { zone: 2, paceSecPerKm: z2, minutes: z2 === null ? 0 : 20 },
    { zone: 3, paceSecPerKm: z3, minutes: z3 === null ? 0 : 8 },
    { zone: 4, paceSecPerKm: null, minutes: 0 },
    { zone: 5, paceSecPerKm: null, minutes: 0 },
]

const bucket = (
    start: string,
    pace: number | null,
    z2: number | null = null,
    avgHrBpm: number | null = null
): RunBucketDTO => ({
    start,
    paceSecPerKm: pace,
    distanceKm: pace === null ? 0 : 20,
    runs: pace === null ? 0 : 3,
    avgHrBpm,
    zones: zones(z2, z2 === null ? null : z2 - 30),
})

const WEEKS = [
    bucket('2026-10-12', 330, 360),
    bucket('2026-10-19', 325, 355),
    bucket('2026-10-26', null),
    bucket('2026-11-02', 318, 350),
    bucket('2026-11-09', 312, 345),
]

const data = (overrides: Partial<RunProgressDTO> = {}): RunProgressDTO => ({
    range: '3m',
    granularity: 'week',
    buckets: WEEKS,
    zoneBounds: zoneBoundsBpm({ maxHr: 190, restingHr: 50 }),
    hasZoneData: true,
    goal: {
        raceId: 'r1',
        name: 'Lisbon 10K',
        raceDate: '2026-12-13',
        daysLeft: 23,
        distanceM: 10_000,
        targetTimeS: 2700,
        paceSecPerKm: 270,
    },
    kpis: {
        avgPaceSecPerKm: 321,
        distanceKm: 80,
        runs: 12,
        recentPaceSecPerKm: 312,
        goalDeltaSecPerKm: 42,
    },
    ...overrides,
})

describe('RunKpis', () => {
    it('shows pace, distance, runs and the goal with its delta in text', () => {
        const view = data()
        render(<RunKpis kpis={view.kpis} goal={view.goal} />)

        expect(screen.getByTestId('kpi-avg-pace-value')).toHaveTextContent('5:21 /km')
        expect(screen.getByTestId('kpi-distance-value')).toHaveTextContent('80.0 km')
        expect(screen.getByTestId('kpi-runs-value')).toHaveTextContent('12')
        expect(screen.getByTestId('kpi-goal-value')).toHaveTextContent('4:30 /km')
        expect(screen.getByTestId('kpi-goal')).toHaveTextContent('Lisbon 10K, in 23 days')
        expect(screen.getByTestId('kpi-goal-delta')).toHaveTextContent('+0:42 /km')
        expect(screen.getByTestId('kpi-goal-delta-text')).toHaveTextContent('slower than goal')
    })

    it('says faster than goal for a negative delta', () => {
        const view = data()
        render(<RunKpis kpis={{ ...view.kpis, goalDeltaSecPerKm: -10 }} goal={view.goal} />)

        expect(screen.getByTestId('kpi-goal-delta-text')).toHaveTextContent('faster than goal')
    })

    it('asks for a running race when there is no goal', () => {
        const view = data()
        render(<RunKpis kpis={{ ...view.kpis, goalDeltaSecPerKm: null }} goal={null} />)

        expect(screen.getByTestId('kpi-goal-empty')).toHaveTextContent(
            'Add a running race to see your goal pace'
        )
        expect(screen.getByTestId('kpi-goal-empty')).toHaveAttribute('href', '/races')
        expect(screen.getByTestId('kpi-goal-value')).toHaveTextContent('-')
    })
})

describe('RunProgressView', () => {
    it('asks for a run when the range has none', () => {
        render(
            <RunProgressView
                data={data({
                    kpis: { ...data().kpis, runs: 0 },
                    buckets: [bucket('2026-11-09', null)],
                })}
            />
        )

        expect(screen.getByTestId('run-progress-empty')).toHaveTextContent(
            'Upload a run to see your pace'
        )
        expect(screen.queryByTestId('pace-chart')).toBeNull()
    })

    it('summarises the pace trend and lists every week in the table', () => {
        render(<RunProgressView data={data()} />)

        expect(screen.getByTestId('pace-chart-takeaway')).toHaveTextContent(
            'Average pace improved from 5:30 /km to 5:12 /km over 3 months.'
        )
        expect(screen.getByTestId('pace-chart-figure')).toHaveAttribute(
            'aria-label',
            'Average pace improved from 5:30 /km to 5:12 /km over 3 months.'
        )
        fireEvent.click(screen.getByTestId('pace-chart-table-toggle'))
        expect(screen.getAllByTestId('pace-chart-table-row')).toHaveLength(5)
        expect(screen.getAllByTestId('pace-chart-table-row')[0]).toHaveTextContent(
            '12 Oct5:30 /km20.0 km3'
        )
    })

    it('shows the table instead of a line when there are fewer than four points', () => {
        render(
            <RunProgressView
                data={data({ buckets: [bucket('2026-11-02', 318), bucket('2026-11-09', 312)] })}
            />
        )

        expect(screen.queryByTestId('pace-chart-figure')).toBeNull()
        expect(screen.getByTestId('pace-chart-table')).toBeInTheDocument()
    })

    it('explains the missing heart rates when the profile has no zones', () => {
        render(<RunProgressView data={data({ zoneBounds: null, hasZoneData: false })} />)

        expect(screen.getByTestId('zone-chart-empty-settings')).toHaveTextContent(
            'Add your max and resting heart rate in Settings to see zones.'
        )
    })

    it('asks for a run with heart rate when there is no zone data', () => {
        render(<RunProgressView data={data({ hasZoneData: false })} />)

        expect(screen.getByTestId('zone-chart-empty-data')).toHaveTextContent(
            'No zone data yet. Upload a run with heart rate.'
        )
    })

    it('offers a toggle only for zones with data and hides a zone from the table', () => {
        render(<RunProgressView data={data()} />)

        expect(screen.queryByTestId('zone-toggle-1')).toBeNull()
        expect(screen.getByTestId('zone-toggle-2')).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByTestId('zone-toggle-3')).toHaveAttribute('aria-pressed', 'true')

        fireEvent.click(screen.getByTestId('zone-chart-table-toggle'))
        expect(screen.getByTestId('zone-chart-table')).toHaveTextContent('Z3')
        fireEvent.click(screen.getByTestId('zone-toggle-3'))
        expect(screen.getByTestId('zone-toggle-3')).toHaveAttribute('aria-pressed', 'false')
        expect(screen.getByTestId('zone-chart-table')).not.toHaveTextContent('Z3')
        expect(screen.getAllByTestId('zone-chart-table-row')[0]).toHaveTextContent(
            '6:00 /km (20 min)'
        )
    })

    it('says so when every zone is hidden', () => {
        render(<RunProgressView data={data()} />)
        fireEvent.click(screen.getByTestId('zone-toggle-2'))
        fireEvent.click(screen.getByTestId('zone-toggle-3'))

        expect(screen.getByTestId('zone-chart-all-hidden')).toBeInTheDocument()
    })

    it('shows the distance chart and the average heart rate chart when there is heart rate data', () => {
        const buckets = [
            bucket('2026-10-12', 330, 360, 158),
            bucket('2026-10-19', 325, 355, 156),
            bucket('2026-10-26', null),
            bucket('2026-11-02', 318, 350, 154),
        ]
        render(<RunProgressView data={data({ buckets })} />)

        expect(screen.getByTestId('distance-chart-takeaway')).toHaveTextContent(
            '80.0 km in 12 runs over 3 months.'
        )
        expect(screen.getByTestId('distance-chart-figure')).toBeInTheDocument()
        expect(screen.getByTestId('heart-rate-chart-takeaway')).toHaveTextContent(
            'From 158 bpm to 154 bpm, weighted by time.'
        )
        expect(screen.getByTestId('heart-rate-chart-figure')).toBeInTheDocument()
    })

    it('leaves out the heart rate chart when no run has a heart rate', () => {
        render(<RunProgressView data={data()} />)

        expect(screen.getByTestId('distance-chart')).toBeInTheDocument()
        expect(screen.queryByTestId('heart-rate-chart')).toBeNull()
    })

    it('lists the distance of every bucket in its table, with a dash for empty weeks', () => {
        render(<RunProgressView data={data()} />)

        fireEvent.click(screen.getByTestId('distance-chart-table-toggle'))
        const rows = screen.getAllByTestId('distance-chart-table-row')
        expect(rows).toHaveLength(5)
        expect(rows[0]).toHaveTextContent('12 Oct20.0 km')
        expect(rows[2]).toHaveTextContent('26 Oct-')
    })
})
