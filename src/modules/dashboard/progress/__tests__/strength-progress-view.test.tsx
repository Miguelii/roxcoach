import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { StrengthProgressDTO, TopExerciseDTO } from '@/_bff/modules/training/types/progress'
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
        ['2026-10-19', 95],
        ['2026-11-02', 100],
    ],
    'https://lyfta.app/images/exercises/squat.png'
)
const BENCH = exercise('bench', 'Bench press', [
    ['2026-10-12', 70],
    ['2026-11-02', 80],
])

const data = (exercises: TopExerciseDTO[] = [SQUAT, BENCH]): StrengthProgressDTO => ({
    range: '6m',
    exercises,
})

describe('StrengthProgressView', () => {
    it('shows one card with a legend entry per exercise, with its picture or a placeholder', () => {
        render(<StrengthProgressView data={data()} />)

        expect(screen.getByTestId('top-exercises')).toBeInTheDocument()
        expect(screen.getByTestId('exercise-toggle-squat')).toBeInTheDocument()
        expect(screen.getByTestId('exercise-toggle-bench')).toBeInTheDocument()
        expect(screen.getByTestId('exercise-image-squat')).toHaveAttribute(
            'alt',
            'Back squat demonstration'
        )
        expect(screen.getByTestId('exercise-image-placeholder-bench')).toBeInTheDocument()
        expect(screen.queryByTestId('body-weight-card')).toBeNull()
    })

    it('shows the latest top set and the change of each exercise', () => {
        render(<StrengthProgressView data={data()} />)

        expect(screen.getByTestId('exercise-latest-squat')).toHaveTextContent('100 kg')
        expect(screen.getByTestId('exercise-change-squat')).toHaveTextContent('+10 kg')
        expect(screen.getByTestId('exercise-change-bench')).toHaveTextContent('+10 kg')
    })

    it('describes the chart for screen readers when there are enough workout dates', () => {
        render(<StrengthProgressView data={data()} />)

        expect(screen.getByTestId('top-exercises-figure')).toHaveAttribute(
            'aria-label',
            'Heaviest set of each workout over 6 months: Back squat 100 kg, Bench press 80 kg.'
        )
    })

    it('lists every workout date in the table with a dash where an exercise was not trained', () => {
        render(<StrengthProgressView data={data()} />)

        fireEvent.click(screen.getByTestId('top-exercises-table-toggle'))
        const rows = screen.getAllByTestId('top-exercises-table-row')
        expect(rows).toHaveLength(4)
        expect(rows[0]).toHaveTextContent('5 Oct90 kg-')
        expect(rows[3]).toHaveTextContent('2 Nov100 kg80 kg')
    })

    it('switches the values to the change since the first workout', () => {
        render(<StrengthProgressView data={data()} />)
        fireEvent.click(screen.getByTestId('metric-change'))

        expect(screen.getByTestId('metric-change')).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByTestId('exercise-change-squat')).toHaveTextContent('+11.1%')
        fireEvent.click(screen.getByTestId('top-exercises-table-toggle'))
        expect(screen.getAllByTestId('top-exercises-table-row')[3]).toHaveTextContent('11.1%')
    })

    it('hides an exercise from the table with its toggle', () => {
        render(<StrengthProgressView data={data()} />)
        fireEvent.click(screen.getByTestId('top-exercises-table-toggle'))
        expect(screen.getByTestId('top-exercises-table')).toHaveTextContent('Bench press')

        fireEvent.click(screen.getByTestId('exercise-toggle-bench'))
        expect(screen.getByTestId('exercise-toggle-bench')).toHaveAttribute('aria-pressed', 'false')
        expect(screen.getByTestId('top-exercises-table')).not.toHaveTextContent('Bench press')
    })

    it('says so when every exercise is hidden', () => {
        render(<StrengthProgressView data={data()} />)
        fireEvent.click(screen.getByTestId('exercise-toggle-squat'))
        fireEvent.click(screen.getByTestId('exercise-toggle-bench'))

        expect(screen.getByTestId('top-exercises-all-hidden')).toBeInTheDocument()
    })

    it('draws no chart and opens the table when there are fewer than three workout dates', () => {
        render(<StrengthProgressView data={data([BENCH])} />)

        expect(screen.queryByTestId('top-exercises-figure')).toBeNull()
        expect(screen.getByTestId('top-exercises-table')).toBeInTheDocument()
    })

    it('points to the Lyfta sync when there are no exercises', () => {
        render(<StrengthProgressView data={data([])} />)

        expect(screen.getByTestId('strength-progress-empty')).toHaveTextContent(
            'Sync Lyfta to see your progress.'
        )
        expect(screen.queryByTestId('top-exercises')).toBeNull()
    })
})
