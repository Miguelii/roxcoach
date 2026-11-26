/* oxlint-disable unicorn/consistent-function-scoping -- test helpers stay next to the cases that use them */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChangeBadge } from '@/modules/dashboard/progress/change-badge'
import { ChartCard } from '@/modules/dashboard/progress/chart-card'

describe('ChartCard', () => {
    it('shows the title, takeaway, children and footnote', () => {
        render(
            <ChartCard title="Pace" takeaway="Getting faster" testId="card" footnote="faster is up">
                <div data-testid="chart-body" />
            </ChartCard>
        )

        expect(screen.getByTestId('card')).toHaveTextContent('Pace')
        expect(screen.getByTestId('card-takeaway')).toHaveTextContent('Getting faster')
        expect(screen.getByTestId('card')).toHaveTextContent('faster is up')
        expect(screen.getByTestId('chart-body')).toBeInTheDocument()
    })

    it('keeps the title and shows a placeholder takeaway while loading', () => {
        render(
            <ChartCard title="Pace" takeaway={null} testId="card">
                <div data-testid="chart-body" />
            </ChartCard>
        )

        expect(screen.getByTestId('card')).toHaveAttribute('aria-busy', 'true')
        expect(screen.getByTestId('card')).toHaveTextContent('Pace')
        expect(screen.getByTestId('card-takeaway-loading')).toBeInTheDocument()
        expect(screen.queryByTestId('card-takeaway')).toBeNull()
    })
})

describe('ChangeBadge', () => {
    const format = (absolute: number) => `${absolute} kg`

    it.each([
        [5, '+5 kg'],
        [-2.5, '-2.5 kg'],
        [0, '0 kg'],
    ])('shows a sign for %d', (delta, text) => {
        render(<ChangeBadge delta={delta} format={format} testId="b" />)

        expect(screen.getByTestId('b')).toHaveTextContent(text)
    })

    it('shows a dash without a change', () => {
        render(<ChangeBadge delta={null} format={format} testId="b" />)

        expect(screen.getByTestId('b')).toHaveTextContent('-')
    })
})
