import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type {
    StrengthBucketDTO,
    StrengthProgressDTO,
    TopExerciseDTO,
} from '@/_bff/modules/training/types/progress'
import { ExerciseCard } from '@/modules/dashboard/progress/exercise-card'
import { StrengthProgressView } from '@/modules/dashboard/progress/strength-progress-view'

const mocks = vi.hoisted(() => ({ isMobile: false }))

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mocks.isMobile }))

// The lazily loaded charts read the reduced motion setting and measure themselves, which jsdom
// does not provide.
beforeEach(() => {
    vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({
            matches: false,
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }))
    )
    vi.stubGlobal(
        'ResizeObserver',
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        }
    )
})

afterEach(() => {
    vi.unstubAllGlobals()
})

const exercise = (
    key: string,
    name: string,
    points: [string, number, number?][],
    imageUrl: string | null = null
): TopExerciseDTO => ({
    key,
    name,
    imageUrl,
    workouts: points.length,
    points: points.map(([date, topSetKg, topSetReps = 5]) => ({ date, topSetKg, topSetReps })),
})

const SQUAT = exercise(
    'squat',
    'Back squat',
    [
        ['2026-10-05', 90],
        ['2026-10-19', 105],
        ['2026-11-02', 100],
    ],
    'https://lyfta.app/images/exercises/squat.png'
)
const BENCH = exercise('bench', 'Bench press', [
    ['2026-10-12', 70],
    ['2026-11-02', 80],
])
const CURL = exercise('curl', 'Curl', [['2026-11-02', 20]])

const bucket = (start: string, volumeKg: number, workouts: number): StrengthBucketDTO => ({
    start,
    volumeKg,
    workouts,
    sets: workouts * 10,
})

const BUCKETS = [
    bucket('2026-10-05', 9000, 2),
    bucket('2026-10-12', 0, 0),
    bucket('2026-10-19', 12_480, 3),
    bucket('2026-10-26', 8000, 2),
]

const MANY = ['squat', 'bench', 'deadlift', 'row', 'press'].map((key, index) =>
    exercise(key, key.toUpperCase(), [['2026-11-02', 50 + index]])
)

const data = (
    exercises: TopExerciseDTO[],
    buckets: StrengthBucketDTO[] = BUCKETS
): StrengthProgressDTO => ({ range: '3m', granularity: 'week', buckets, exercises })

describe('ExerciseCard', () => {
    it('shows the picture, the latest top set, the change since the first and the best', () => {
        render(<ExerciseCard exercise={SQUAT} />)

        expect(screen.getByTestId('exercise-image-squat')).toHaveAttribute(
            'alt',
            'Back squat demonstration'
        )
        expect(screen.getByTestId('exercise-latest')).toHaveTextContent('100 kg')
        expect(screen.getByTestId('exercise-change')).toHaveTextContent('+10 kg')
        expect(screen.getByTestId('exercise-best')).toHaveTextContent('105 kg x 5')
        expect(screen.getByTestId('exercise-latest-reps')).toHaveTextContent('x 5 reps')
        expect(screen.getByTestId('exercise-verdict')).toHaveTextContent('Progressing')
        expect(screen.getByTestId('exercise-insight-load')).toHaveTextContent('+10 kg')
        expect(screen.getByTestId('exercise-insight-reps')).toHaveTextContent('no change')
        expect(screen.queryByTestId('exercise-insight-e1rm')).toBeNull()
        expect(screen.getByTestId('exercise-insight-best')).toHaveTextContent('1 workout ago')
    })

    it('uses a placeholder when the exercise has no picture', () => {
        render(<ExerciseCard exercise={BENCH} />)

        expect(screen.getByTestId('exercise-image-placeholder-bench')).toBeInTheDocument()
    })

    it('always draws a chart, described for screen readers, and never shows a table', () => {
        const { unmount } = render(<ExerciseCard exercise={BENCH} />)
        expect(screen.getByTestId('exercise-chart-figure')).toHaveAttribute(
            'aria-label',
            'Bench press top set, from 70 kg for 5 reps to 80 kg for 5 reps over 2 workouts.'
        )
        expect(screen.queryByTestId('exercise-table-bench-toggle')).toBeNull()
        unmount()

        render(<ExerciseCard exercise={CURL} />)
        expect(screen.getByTestId('exercise-chart-figure')).toHaveAttribute(
            'aria-label',
            'Curl top set, 20 kg for 5 reps in 1 workout.'
        )
        expect(screen.queryByTestId('exercise-change')).toBeNull()
        expect(screen.queryByTestId('exercise-insights')).toBeNull()
    })

    it('hides the change when the top set did not move', () => {
        render(
            <ExerciseCard
                exercise={exercise('press', 'Press', [
                    ['2026-10-01', 40],
                    ['2026-11-02', 40],
                ])}
            />
        )

        expect(screen.getByTestId('exercise-latest')).toHaveTextContent('40 kg')
        expect(screen.queryByTestId('exercise-change')).toBeNull()
    })
})

describe('StrengthProgressView', () => {
    it('opens with a progress summary of every lift before the top exercises', () => {
        render(<StrengthProgressView data={data([SQUAT, BENCH, CURL])} />)

        expect(screen.getByTestId('strength-overview-takeaway')).toHaveTextContent(
            '2 progressing, 0 holding steady, 0 slipping across your 2 most used lifts.'
        )
        expect(screen.getByTestId('strength-overview-progressing')).toHaveTextContent('2 of 2')
        expect(screen.getByTestId('strength-overview-records')).toHaveTextContent('2')
        expect(screen.getByTestId('strength-overview-heaviest')).toHaveTextContent('105 kg x 5')
        expect(screen.getByTestId('strength-overview-reps')).toHaveTextContent('no change')
        expect(screen.queryByTestId('strength-overview-slipping')).toBeNull()
        expect(screen.getByTestId('strength-overview-bar').children).toHaveLength(2)
    })

    it('shows the volume and workouts charts, then one chart card per exercise', () => {
        render(<StrengthProgressView data={data([SQUAT, BENCH, CURL])} />)

        expect(screen.getByTestId('volume-chart-takeaway')).toHaveTextContent(
            '29,480 kg lifted over 3 months.'
        )
        expect(screen.getByTestId('volume-chart-figure')).toBeInTheDocument()
        expect(screen.getByTestId('workouts-chart-takeaway')).toHaveTextContent(
            '7 workouts, 1.8 per week.'
        )
        expect(screen.getAllByTestId('exercise-card')).toHaveLength(3)
    })

    it('always draws the volume and workouts charts, even with a single week of data', () => {
        render(
            <StrengthProgressView
                data={data([SQUAT], [bucket('2026-10-05', 9000, 2), bucket('2026-10-12', 0, 0)])}
            />
        )

        expect(screen.getByTestId('volume-chart-figure')).toBeInTheDocument()
        expect(screen.getByTestId('workouts-chart-figure')).toBeInTheDocument()
    })

    it('never shows a table', () => {
        render(<StrengthProgressView data={data([SQUAT, BENCH, CURL])} />)

        expect(screen.queryByTestId('volume-chart-table-toggle')).toBeNull()
        expect(screen.queryByTestId('workouts-chart-table-toggle')).toBeNull()
    })

    it('says so when workouts exist but no set has a load', () => {
        render(<StrengthProgressView data={data([])} />)

        expect(screen.getByTestId('top-exercises-empty')).toHaveTextContent(
            'No weighted sets in this range.'
        )
    })

    it('points to the Lyfta sync when there is nothing at all', () => {
        render(<StrengthProgressView data={data([], [bucket('2026-10-05', 0, 0)])} />)

        expect(screen.getByTestId('strength-progress-empty')).toHaveTextContent(
            'Sync Lyfta to see your progress.'
        )
        expect(screen.queryByTestId('volume-chart')).toBeNull()
    })
})

// base-ui selects an item on a full pointer press, not on a bare click.
const pick = (option: HTMLElement) => {
    fireEvent.pointerDown(option, { pointerType: 'mouse' })
    fireEvent.mouseUp(option)
    fireEvent.click(option)
}

describe('exercise filter', () => {
    beforeEach(() => {
        mocks.isMobile = false
    })

    it('shows the top 4 by default and offers every exercise in the list', () => {
        render(<StrengthProgressView data={data(MANY)} />)

        expect(screen.getAllByTestId('exercise-card')).toHaveLength(4)
        expect(screen.getByTestId('exercise-filter')).toHaveTextContent('Top 4')
        expect(screen.queryByTestId('exercise-filter-drawer')).toBeNull()
    })

    it('on a wide screen picks one exercise from a dropdown whose first option is the top ones', async () => {
        render(<StrengthProgressView data={data(MANY)} />)
        fireEvent.click(screen.getByTestId('exercise-filter'))

        const options = await screen.findAllByRole('option')
        expect(options[0]).toHaveTextContent('Top 4')
        expect(options).toHaveLength(6)

        pick(await screen.findByTestId('exercise-filter-option-press'))
        await waitFor(() => expect(screen.getAllByTestId('exercise-card')).toHaveLength(1))
        expect(screen.getByTestId('exercise-card')).toHaveAttribute('aria-label', 'PRESS')
        expect(screen.getByTestId('exercise-filter')).toHaveTextContent('PRESS')
    })

    it('goes back to the top ones from the first option', async () => {
        render(<StrengthProgressView data={data(MANY)} />)
        fireEvent.click(screen.getByTestId('exercise-filter'))
        pick(await screen.findByTestId('exercise-filter-option-press'))
        await waitFor(() => expect(screen.getAllByTestId('exercise-card')).toHaveLength(1))

        fireEvent.click(screen.getByTestId('exercise-filter'))
        pick(await screen.findByTestId('exercise-filter-option-top'))
        await waitFor(() => expect(screen.getAllByTestId('exercise-card')).toHaveLength(4))
    })

    it('on a phone has no dropdown but a button that opens a list in a bottom drawer', async () => {
        mocks.isMobile = true
        render(<StrengthProgressView data={data(MANY)} />)

        expect(screen.queryByRole('combobox')).toBeNull()
        expect(screen.queryByTestId('exercise-filter-drawer')).toBeNull()
        fireEvent.click(screen.getByTestId('exercise-filter'))

        expect(await screen.findByTestId('exercise-filter-drawer')).toBeInTheDocument()
        expect(screen.getByTestId('exercise-filter-option-top')).toHaveAttribute(
            'aria-pressed',
            'true'
        )
        expect(screen.getByTestId('exercise-filter-option-squat')).toHaveTextContent('1 workouts')
    })

    it('on a phone shows the chosen exercise from the drawer list', async () => {
        mocks.isMobile = true
        render(<StrengthProgressView data={data(MANY)} />)
        fireEvent.click(screen.getByTestId('exercise-filter'))
        fireEvent.click(await screen.findByTestId('exercise-filter-option-row'))

        await waitFor(() => expect(screen.getAllByTestId('exercise-card')).toHaveLength(1))
        expect(screen.getByTestId('exercise-card')).toHaveAttribute('aria-label', 'ROW')
        expect(screen.getByTestId('exercise-filter')).toHaveTextContent('ROW')
    })

    it('has no filter when there are no exercises', () => {
        render(<StrengthProgressView data={data([])} />)

        expect(screen.queryByTestId('exercise-filter')).toBeNull()
    })

    it('labels the first option with how many exercises it really shows', () => {
        render(<StrengthProgressView data={data([SQUAT, BENCH])} />)

        expect(screen.getByTestId('exercise-filter')).toHaveTextContent('Top 2')
    })
})
