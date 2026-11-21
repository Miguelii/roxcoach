import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { zoneBoundsBpm } from '@/_bff/core/constants/hr-zones.constants'
import type { RunBucketDTO, RunProgressDTO } from '@/_bff/modules/training/types/progress'
import { makeItem } from '@/modules/calendar/__tests__/fixtures'
import { GoalPaceCard } from '@/modules/dashboard/progress/goal-pace-card'
import { RecentRuns } from '@/modules/dashboard/progress/recent-runs'
import { RunProgressView } from '@/modules/dashboard/progress/run-progress-view'
import { WeekDots } from '@/modules/dashboard/progress/week-dots'

const TODAY = '2026-11-20'

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
    movingTimeS: pace === null ? 0 : 6000,
    runs: pace === null ? 0 : 3,
    avgHrBpm,
    zones: zones(z2, z2 === null ? null : z2 - 30),
})

const WEEKS = [
    bucket('2026-10-12', 330, 360),
    bucket('2026-10-19', 325, 355),
    bucket('2026-10-26', null),
    bucket('2026-11-02', 318, 350),
    { ...bucket('2026-11-09', 312, 345), distanceKm: 25 },
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
    readiness: null,
    kpis: {
        avgPaceSecPerKm: 321,
        distanceKm: 80,
        runs: 12,
        recentPaceSecPerKm: 312,
        goalDeltaSecPerKm: 42,
    },
    ...overrides,
})

const ITEMS = [
    makeItem({
        id: 'r1',
        name: 'Tempo',
        startedAt: '2026-11-16T07:00:00+00:00',
        localDate: '2026-11-16',
        distanceM: 8000,
        movingTimeS: 2400,
        avgSpeedMps: 3.33,
    }),
    makeItem({
        id: 'r2',
        name: 'Long run',
        startedAt: '2026-11-18T07:00:00+00:00',
        localDate: '2026-11-18',
        distanceM: 10_000,
        movingTimeS: 3300,
        avgSpeedMps: 3.03,
    }),
    makeItem({
        id: 's1',
        category: 'strength',
        name: 'Legs',
        startedAt: '2026-11-17T18:00:00+00:00',
        localDate: '2026-11-17',
        distanceM: null,
    }),
    makeItem({
        id: 'r0',
        name: 'Old run',
        startedAt: '2026-11-02T07:00:00+00:00',
        localDate: '2026-11-02',
        distanceM: 5000,
        movingTimeS: 1500,
        avgSpeedMps: 3.33,
    }),
]

const view = (overrides: Partial<RunProgressDTO> = {}) =>
    render(<RunProgressView data={data(overrides)} items={ITEMS} today={TODAY} />)

describe('WeekDots', () => {
    it('fills the days with a run, rings today and totals the kilometres of the week', () => {
        render(<WeekDots items={ITEMS} today={TODAY} />)

        expect(screen.getByTestId('week-dot-2026-11-16')).toHaveAttribute('data-ran', 'true')
        expect(screen.getByTestId('week-dot-2026-11-18')).toHaveAttribute('data-ran', 'true')
        expect(screen.getByTestId('week-dot-2026-11-17')).toHaveAttribute('data-ran', 'false')
        expect(screen.getByTestId('week-dot-2026-11-17')).toHaveAttribute(
            'aria-label',
            'Tue 17 Nov, no run'
        )
        expect(screen.getByTestId('week-dot-2026-11-16')).toHaveAttribute(
            'aria-label',
            'Mon 16 Nov, 8.0 km'
        )
        expect(screen.getByTestId('week-dots-total')).toHaveTextContent('18.0 km')
    })

    it('shows an empty week as zero', () => {
        render(<WeekDots items={[]} today={TODAY} />)

        expect(screen.getByTestId('week-dots-total')).toHaveTextContent('0.0 km')
        expect(screen.getByTestId('week-dot-2026-11-20')).toHaveAttribute('data-ran', 'false')
    })
})

describe('RecentRuns', () => {
    it('lists runs newest first, links to each, and leaves out other workouts', () => {
        render(<RecentRuns items={ITEMS} />)

        const links = screen.getAllByRole('link')
        expect(links.map((link) => link.getAttribute('href'))).toEqual([
            '/activities/r2',
            '/activities/r1',
            '/activities/r0',
        ])
        expect(screen.getByTestId('recent-run-r2')).toHaveTextContent('Long run')
        expect(screen.getByTestId('recent-run-r2')).toHaveTextContent('10.0')
        expect(screen.getByTestId('recent-run-r2')).toHaveTextContent('Wed 18 Nov')
        expect(screen.queryByTestId('recent-run-s1')).toBeNull()
    })

    it('renders nothing without runs', () => {
        render(<RecentRuns items={[]} />)

        expect(screen.queryByTestId('recent-runs')).toBeNull()
    })
})

describe('GoalPaceCard', () => {
    it('shows the goal pace, the race and the delta in text', () => {
        render(<GoalPaceCard goal={data().goal} deltaSecPerKm={42} />)

        expect(screen.getByTestId('goal-pace-value')).toHaveTextContent('4:30 /km')
        expect(screen.getByTestId('goal-pace')).toHaveTextContent('Lisbon 10K, in 23 days')
        expect(screen.getByTestId('goal-pace-delta')).toHaveTextContent('+0:42 /km')
        expect(screen.getByTestId('goal-pace-delta-text')).toHaveTextContent('slower than goal')
    })

    it('says faster than goal for a negative delta', () => {
        render(<GoalPaceCard goal={data().goal} deltaSecPerKm={-10} />)

        expect(screen.getByTestId('goal-pace-delta-text')).toHaveTextContent('faster than goal')
    })

    it('asks for a running race when there is no goal', () => {
        render(<GoalPaceCard goal={null} deltaSecPerKm={null} />)

        expect(screen.getByTestId('goal-pace-empty')).toHaveTextContent(
            'Add a running race to see your goal pace'
        )
        expect(screen.getByTestId('goal-pace-empty')).toHaveAttribute('href', '/races')
    })
})

describe('ProgressHero', () => {
    it('opens on this week with its distance, the change from last week and the stats', () => {
        view()

        expect(screen.getByTestId('hero-eyebrow')).toHaveTextContent('This week')
        expect(screen.getByTestId('hero-value')).toHaveTextContent('25.0 km')
        expect(screen.getByTestId('hero-delta')).toHaveTextContent('+5.0 km')
        expect(screen.getByTestId('hero-stat-time')).toHaveTextContent('1h 40m')
        expect(screen.getByTestId('hero-stat-runs')).toHaveTextContent('3')
        expect(screen.getByTestId('hero-stat-pace')).toHaveTextContent('5:12 /km')
        expect(screen.getByTestId('hero-next')).toBeDisabled()
    })

    it('steps back to an earlier week and forward again', () => {
        view()
        fireEvent.click(screen.getByTestId('hero-previous'))

        expect(screen.getByTestId('hero-eyebrow')).toHaveTextContent('Week of 2 Nov')
        expect(screen.getByTestId('hero-value')).toHaveTextContent('20.0 km')
        expect(screen.getByTestId('hero-next')).not.toBeDisabled()
        fireEvent.click(screen.getByTestId('hero-next'))
        expect(screen.getByTestId('hero-eyebrow')).toHaveTextContent('This week')
    })

    it('cannot step before the first week, which has no previous to compare', () => {
        view()
        for (let step = 0; step < 4; step += 1) fireEvent.click(screen.getByTestId('hero-previous'))

        expect(screen.getByTestId('hero-previous')).toBeDisabled()
        expect(screen.getByTestId('hero-delta')).toHaveTextContent('-')
    })

    it('switches the headline to time and to runs', () => {
        view()
        fireEvent.click(screen.getByTestId('hero-metric-time'))
        expect(screen.getByTestId('hero-value')).toHaveTextContent('1h 40m')
        expect(screen.getByTestId('hero-metric-time')).toHaveAttribute('aria-selected', 'true')

        fireEvent.click(screen.getByTestId('hero-metric-runs'))
        expect(screen.getByTestId('hero-value')).toHaveTextContent('3')
    })

    it('describes the chart for screen readers', () => {
        view()

        expect(screen.getByTestId('hero-figure')).toHaveAttribute(
            'aria-label',
            'Distance per week, this week: 25.0 km.'
        )
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
                items={[]}
                today={TODAY}
            />
        )

        expect(screen.getByTestId('run-progress-empty')).toHaveTextContent(
            'Upload a run to see your pace'
        )
        expect(screen.queryByTestId('progress-hero')).toBeNull()
    })

    it('shows the cards in the order of a training app', () => {
        view()

        const order = [
            'week-dots',
            'progress-hero',
            'goal-pace',
            'recent-runs',
            'pace-chart',
            'zone-chart',
        ].map((id) => screen.getByTestId(id))
        for (let index = 1; index < order.length; index += 1) {
            const before = order[index - 1]
            const after = order[index]
            expect(
                before !== undefined &&
                    after !== undefined &&
                    Boolean(
                        before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING
                    )
            ).toBe(true)
        }
    })

    it('summarises the pace trend in a chart and never shows a table', () => {
        view()

        expect(screen.getByTestId('pace-chart-takeaway')).toHaveTextContent(
            'Average pace improved from 5:30 /km to 5:12 /km over 3 months.'
        )
        expect(screen.getByTestId('pace-chart-figure')).toHaveAttribute(
            'aria-label',
            'Average pace improved from 5:30 /km to 5:12 /km over 3 months.'
        )
        expect(screen.queryByTestId('pace-chart-table-toggle')).toBeNull()
    })

    it('explains the missing heart rates when the profile has no zones', () => {
        view({ zoneBounds: null, hasZoneData: false })

        expect(screen.getByTestId('zone-chart-empty-settings')).toHaveTextContent(
            'Add your max and resting heart rate in Settings to see zones.'
        )
    })

    it('asks for a run with heart rate when there is no zone data', () => {
        view({ hasZoneData: false })

        expect(screen.getByTestId('zone-chart-empty-data')).toHaveTextContent(
            'No zone data yet. Upload a run with heart rate.'
        )
    })

    it('offers a toggle only for zones with data and shows the zone chart', () => {
        view()

        expect(screen.queryByTestId('zone-toggle-1')).toBeNull()
        expect(screen.getByTestId('zone-toggle-2')).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByTestId('zone-chart-figure')).toHaveAttribute(
            'aria-label',
            'Pace in each heart rate zone, Z2, Z3.'
        )
        fireEvent.click(screen.getByTestId('zone-toggle-3'))
        expect(screen.getByTestId('zone-chart-figure')).toHaveAttribute(
            'aria-label',
            'Pace in each heart rate zone, Z2.'
        )
    })

    it('says so when every zone is hidden', () => {
        view()
        fireEvent.click(screen.getByTestId('zone-toggle-2'))
        fireEvent.click(screen.getByTestId('zone-toggle-3'))

        expect(screen.getByTestId('zone-chart-all-hidden')).toBeInTheDocument()
    })

    it('shows the average heart rate chart only when some run has a heart rate', () => {
        const { unmount } = view()
        expect(screen.queryByTestId('heart-rate-chart')).toBeNull()
        unmount()

        view({
            buckets: [
                bucket('2026-10-12', 330, 360, 158),
                bucket('2026-10-19', 325, 355, 156),
                bucket('2026-11-02', 318, 350, 154),
            ],
        })
        expect(screen.getByTestId('heart-rate-chart-takeaway')).toHaveTextContent(
            'From 158 bpm to 154 bpm, weighted by time.'
        )
        expect(screen.getByTestId('heart-rate-chart-figure')).toBeInTheDocument()
    })
})

const READINESS: NonNullable<RunProgressDTO['readiness']> = {
    race: {
        raceId: 'h1',
        name: 'Hyrox Lisbon',
        raceType: 'hyrox',
        raceDate: '2027-01-10',
        daysLeft: 50,
        targetTimeS: 5400,
        priority: 'A',
        racePaceSPerKm: 355,
    },
    load: { state: 'on_track', weeklyKm: 38, previousWeeklyKm: 36, ratio: 1.06, easySharePct: 71 },
    pace: { state: 'attention', fastSessions: 2, fastTimeS: 500 },
}

describe('RunProgressView race readiness', () => {
    it('shows the banner and the readiness card first when there is a next race', () => {
        view({ readiness: READINESS })

        expect(screen.getByTestId('race-banner-name')).toHaveTextContent('Hyrox Lisbon')
        expect(screen.getByTestId('race-banner-days')).toHaveTextContent('50 days to go')
        expect(screen.getByTestId('race-banner-pace')).toHaveTextContent('5:55 /km')
        expect(screen.getByTestId('readiness-load-state')).toHaveTextContent('On track')
        expect(screen.getByTestId('readiness-pace-state')).toHaveTextContent('Needs attention')
        expect(screen.getByTestId('readiness-pace-reason')).toHaveTextContent('aim for 3')
    })

    it('shows neither without a next race', () => {
        view()

        expect(screen.queryByTestId('race-banner')).toBeNull()
        expect(screen.queryByTestId('readiness-card')).toBeNull()
    })

    it('keeps the banner when there are no runs yet', () => {
        view({ readiness: READINESS, kpis: { ...data().kpis, runs: 0 } })

        expect(screen.getByTestId('race-banner')).toBeInTheDocument()
        expect(screen.getByTestId('run-progress-empty')).toBeInTheDocument()
    })
})
