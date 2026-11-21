import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { StrengthProgressDTO, TopExerciseDTO } from '@/_bff/modules/training/types/progress'
import { BodyWeightCard } from '@/modules/dashboard/progress/body-weight-card'
import { ExerciseCard } from '@/modules/dashboard/progress/exercise-card'
import { StrengthProgressView } from '@/modules/dashboard/progress/strength-progress-view'

const point = (date: string, topSetKg: number | null, estimatedOneRmKg: number | null) => ({
    date,
    topSetKg,
    estimatedOneRmKg,
})

const exercise = (key: string, name: string, points: TopExerciseDTO['points']): TopExerciseDTO => ({
    key,
    name,
    workouts: points.length,
    points,
})

const SQUAT = exercise('squat', 'Back squat', [
    point('2026-10-05', 90, 105),
    point('2026-10-19', 95, 110.8),
    point('2026-11-02', 100, 116.7),
])

const data = (overrides: Partial<StrengthProgressDTO> = {}): StrengthProgressDTO => ({
    range: '6m',
    exercises: [SQUAT, exercise('bench', 'Bench press', [point('2026-11-02', 80, 90)])],
    bodyWeight: [
        { date: '2026-10-05', kg: 82 },
        { date: '2026-10-19', kg: 81.5 },
        { date: '2026-11-02', kg: 80.5 },
    ],
    ...overrides,
})

describe('ExerciseCard', () => {
    it('shows the latest top set and the change as a signed value', () => {
        render(<ExerciseCard exercise={SQUAT} metric="topSetKg" />)

        expect(screen.getByTestId('exercise-latest')).toHaveTextContent('100 kg')
        expect(screen.getByTestId('exercise-change')).toHaveTextContent('+10 kg')
        expect(screen.getByTestId('exercise-chart-figure')).toBeInTheDocument()
    })

    it('shows the estimated 1RM for the other metric', () => {
        render(<ExerciseCard exercise={SQUAT} metric="estimatedOneRmKg" />)

        expect(screen.getByTestId('exercise-latest')).toHaveTextContent('116.7 kg')
        expect(screen.getByTestId('exercise-change')).toHaveTextContent('+11.7 kg')
    })

    it('shows a dash when the metric has no values', () => {
        const noOneRm = exercise('curl', 'Curl', [point('2026-11-02', 20, null)])
        render(<ExerciseCard exercise={noOneRm} metric="estimatedOneRmKg" />)

        expect(screen.getByTestId('exercise-latest')).toHaveTextContent('-')
        expect(screen.getByTestId('exercise-change')).toHaveTextContent('-')
    })

    it('draws no chart and opens the table for fewer than three points', () => {
        const short = exercise('bench', 'Bench press', [
            point('2026-10-19', 75, 85),
            point('2026-11-02', 80, 90),
        ])
        render(<ExerciseCard exercise={short} metric="topSetKg" />)

        expect(screen.queryByTestId('exercise-chart-figure')).toBeNull()
        expect(screen.getByTestId('exercise-table-bench')).toBeInTheDocument()
        expect(screen.getAllByTestId('exercise-table-bench-row')).toHaveLength(2)
    })

    it('skips workouts where the metric is empty', () => {
        const mixed = exercise('press', 'Press', [
            point('2026-10-05', null, null),
            point('2026-10-19', 50, 58),
            point('2026-11-02', 55, 63),
        ])
        render(<ExerciseCard exercise={mixed} metric="topSetKg" />)

        expect(screen.getByTestId('exercise-change')).toHaveTextContent('+5 kg')
        expect(screen.getAllByTestId('exercise-table-press-row')).toHaveLength(2)
    })
})

describe('StrengthProgressView', () => {
    it('renders one card per exercise and the body weight card', () => {
        render(<StrengthProgressView data={data()} />)

        expect(screen.getAllByTestId('exercise-card')).toHaveLength(2)
        expect(screen.getByTestId('body-weight-card')).toBeInTheDocument()
    })

    it('switches every card to the estimated 1RM', () => {
        render(<StrengthProgressView data={data()} />)
        expect(screen.getAllByTestId('exercise-latest')[0]).toHaveTextContent('100 kg')

        fireEvent.click(screen.getByTestId('metric-one-rm'))
        expect(screen.getAllByTestId('exercise-latest')[0]).toHaveTextContent('116.7 kg')
        expect(screen.getByTestId('metric-one-rm')).toHaveAttribute('aria-selected', 'true')
    })

    it('points to the Lyfta sync when there are no exercises', () => {
        render(<StrengthProgressView data={data({ exercises: [] })} />)

        expect(screen.getByTestId('strength-progress-empty')).toHaveTextContent(
            'Sync Lyfta to see your progress.'
        )
        expect(screen.queryByTestId('exercise-card')).toBeNull()
    })
})

describe('BodyWeightCard', () => {
    it('shows the latest weight and the change over the range', () => {
        render(<BodyWeightCard points={data().bodyWeight} />)

        expect(screen.getByTestId('body-weight-latest')).toHaveTextContent('80.5 kg')
        expect(screen.getByTestId('body-weight-change')).toHaveTextContent('-1.5 kg')
        expect(screen.getByTestId('body-weight-figure')).toBeInTheDocument()
    })

    it('shows just the value for a single point', () => {
        render(<BodyWeightCard points={[{ date: '2026-11-02', kg: 80.5 }]} />)

        expect(screen.getByTestId('body-weight-latest')).toHaveTextContent('80.5 kg')
        expect(screen.getByTestId('body-weight-change')).toHaveTextContent('-')
        expect(screen.queryByTestId('body-weight-figure')).toBeNull()
        expect(screen.getByTestId('body-weight-table')).toBeInTheDocument()
    })

    it('says so when no body weight was logged', () => {
        render(<BodyWeightCard points={[]} />)

        expect(screen.getByTestId('body-weight-empty')).toHaveTextContent(
            'Log your body weight in Lyfta'
        )
    })
})
