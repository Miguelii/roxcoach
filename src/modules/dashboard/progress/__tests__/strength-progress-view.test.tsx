import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { StrengthProgressDTO, TopExerciseDTO } from '@/_bff/modules/training/types/progress'
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

const data = (exercises: TopExerciseDTO[]): StrengthProgressDTO => ({ range: '6m', exercises })

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

    it('draws a chart described for screen readers from two workouts on', () => {
        render(<ExerciseCard exercise={BENCH} />)

        expect(screen.getByTestId('exercise-chart-figure')).toHaveAttribute(
            'aria-label',
            'Bench press top set, from 70 kg to 80 kg over 2 workouts.'
        )
    })

    it('draws no chart for a single workout, shows its value, and opens the table', () => {
        render(<ExerciseCard exercise={CURL} />)

        expect(screen.queryByTestId('exercise-chart-figure')).toBeNull()
        expect(screen.getByTestId('exercise-latest')).toHaveTextContent('20 kg')
        expect(screen.getByTestId('exercise-change')).toHaveTextContent('-')
        expect(screen.getByTestId('exercise-table-curl')).toBeInTheDocument()
    })

    it('lists every workout in the table', () => {
        render(<ExerciseCard exercise={SQUAT} />)

        fireEvent.click(screen.getByTestId('exercise-table-squat-toggle'))
        expect(screen.getAllByTestId('exercise-table-squat-row')).toHaveLength(3)
        expect(screen.getAllByTestId('exercise-table-squat-row')[1]).toHaveTextContent(
            '19 Oct105 kg'
        )
    })
})

describe('StrengthProgressView', () => {
    it('shows one card per exercise, one below the other', () => {
        render(<StrengthProgressView data={data([SQUAT, BENCH, CURL])} />)

        expect(screen.getAllByTestId('exercise-card')).toHaveLength(3)
        expect(screen.queryByTestId('body-weight-card')).toBeNull()
    })

    it('points to the Lyfta sync when there are no exercises', () => {
        render(<StrengthProgressView data={data([])} />)

        expect(screen.getByTestId('strength-progress-empty')).toHaveTextContent(
            'Sync Lyfta to see your progress.'
        )
        expect(screen.queryByTestId('exercise-card')).toBeNull()
    })
})
