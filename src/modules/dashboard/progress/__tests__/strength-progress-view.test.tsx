import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type {
    StrengthBucketDTO,
    StrengthProgressDTO,
    TopExerciseDTO,
} from '@/_bff/modules/training/types/progress'
import { ExerciseCard } from '@/modules/dashboard/progress/exercise-card'
import { StrengthProgressView } from '@/modules/dashboard/progress/strength-progress-view'

const exercise = (
    key: string,
    name: string,
    points: [string, number][],
    imageUrl: string | null = null
): TopExerciseDTO => ({
    key,
    name,
    imageUrl,
    workouts: points.length,
    points: points.map(([date, topSetKg]) => ({ date, topSetKg })),
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
        expect(screen.getByTestId('exercise-best')).toHaveTextContent('105 kg')
    })

    it('uses a placeholder when the exercise has no picture', () => {
        render(<ExerciseCard exercise={BENCH} />)

        expect(screen.getByTestId('exercise-image-placeholder-bench')).toBeInTheDocument()
    })

    it('always draws a chart, described for screen readers, and never shows a table', () => {
        const { unmount } = render(<ExerciseCard exercise={BENCH} />)
        expect(screen.getByTestId('exercise-chart-figure')).toHaveAttribute(
            'aria-label',
            'Bench press top set, from 70 kg to 80 kg over 2 workouts.'
        )
        expect(screen.queryByTestId('exercise-table-bench-toggle')).toBeNull()
        unmount()

        render(<ExerciseCard exercise={CURL} />)
        expect(screen.getByTestId('exercise-chart-figure')).toHaveAttribute(
            'aria-label',
            'Curl top set, 20 kg in 1 workout.'
        )
        expect(screen.getByTestId('exercise-change')).toHaveTextContent('-')
    })
})

describe('StrengthProgressView', () => {
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

    it('lists the volume of every week in its table, with a dash for an empty week', () => {
        render(<StrengthProgressView data={data([SQUAT])} />)

        fireEvent.click(screen.getByTestId('volume-chart-table-toggle'))
        const rows = screen.getAllByTestId('volume-chart-table-row')
        expect(rows).toHaveLength(4)
        expect(rows[1]).toHaveTextContent('12 Oct-')
        expect(rows[2]).toHaveTextContent('19 Oct12,480 kg')
    })

    it('opens the table instead of drawing a bar chart when only one week has data', () => {
        render(
            <StrengthProgressView
                data={data([SQUAT], [bucket('2026-10-05', 9000, 2), bucket('2026-10-12', 0, 0)])}
            />
        )

        expect(screen.queryByTestId('volume-chart-figure')).toBeNull()
        expect(screen.getByTestId('volume-chart-table')).toBeInTheDocument()
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
