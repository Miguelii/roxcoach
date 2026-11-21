import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ChangeBadge } from '@/modules/dashboard/progress/change-badge'
import { ChartCard } from '@/modules/dashboard/progress/chart-card'
import { ChartDataTable } from '@/modules/dashboard/progress/chart-data-table'

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
})

describe('ChartDataTable', () => {
    const rows = [
        ['2026-11-16', '5:10 /km'],
        ['2026-11-23', null],
    ]

    it('is collapsed until asked for, then lists every row with a dash for gaps', () => {
        render(
            <ChartDataTable
                caption="Pace by week"
                columns={['Week', 'Pace']}
                rows={rows}
                testId="t"
            />
        )

        expect(screen.queryByTestId('t')).toBeNull()
        expect(screen.getByTestId('t-toggle')).toHaveAttribute('aria-expanded', 'false')
        fireEvent.click(screen.getByTestId('t-toggle'))
        expect(screen.getByTestId('t-toggle')).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getAllByTestId('t-row')).toHaveLength(2)
        expect(screen.getAllByTestId('t-row')[1]).toHaveTextContent('2026-11-23-')
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
