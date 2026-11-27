import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { WeeklyGoalProgress } from '@/_bff/core/utils/weekly-goals.utils'
import {
    WeeklyGoalsCardLoading,
    WeeklyGoalsCardView,
} from '@/modules/dashboard/weekly-goals-card-view'

const progressOf = (overrides: Partial<WeeklyGoalProgress> = {}): WeeklyGoalProgress => ({
    daysLeft: 4,
    distanceM: null,
    longRuns: null,
    fastRuns: null,
    strengthSessions: null,
    ...overrides,
})

describe('WeeklyGoalsCardView', () => {
    it('shows distance, long and fast runs in run mode', () => {
        render(
            <WeeklyGoalsCardView
                mode="run"
                progress={progressOf({
                    distanceM: { goal: 30_000, done: 13_400, remaining: 16_600 },
                    longRuns: { goal: 1, done: 0, remaining: 1 },
                    fastRuns: { goal: 2, done: 1, remaining: 1 },
                    strengthSessions: { goal: 3, done: 0, remaining: 3 },
                })}
            />
        )

        expect(screen.getByTestId('weekly-goal-distance-value')).toHaveTextContent('13.4 / 30 km')
        expect(screen.getByTestId('weekly-goal-distance-remaining')).toHaveTextContent(
            '16.6 km to go'
        )
        expect(screen.getByTestId('weekly-goal-long-value')).toHaveTextContent('0 / 1')
        expect(screen.getByTestId('weekly-goal-fast-value')).toHaveTextContent('1 / 2')
        expect(screen.queryByTestId('weekly-goal-strength')).toBeNull()
    })

    it('says You still need a long run / You still need 2 long runs', () => {
        const { rerender } = render(
            <WeeklyGoalsCardView
                mode="run"
                progress={progressOf({ longRuns: { goal: 1, done: 0, remaining: 1 } })}
            />
        )
        expect(screen.getByTestId('weekly-goal-long-remaining')).toHaveTextContent(
            'You still need a long run'
        )

        rerender(
            <WeeklyGoalsCardView
                mode="run"
                progress={progressOf({ longRuns: { goal: 2, done: 0, remaining: 2 } })}
            />
        )
        expect(screen.getByTestId('weekly-goal-long-remaining')).toHaveTextContent(
            'You still need 2 long runs'
        )
    })

    it('shows Done with a check for a met goal', () => {
        render(
            <WeeklyGoalsCardView
                mode="run"
                progress={progressOf({ fastRuns: { goal: 1, done: 1, remaining: 0 } })}
            />
        )

        expect(screen.getByTestId('weekly-goal-fast-remaining')).toHaveTextContent('Done')
        expect(screen.getByTestId('weekly-goal-fast-done-icon')).toBeInTheDocument()
    })

    it('shows only the strength goal in strength mode', () => {
        render(
            <WeeklyGoalsCardView
                mode="strength"
                progress={progressOf({
                    distanceM: { goal: 30_000, done: 0, remaining: 30_000 },
                    strengthSessions: { goal: 3, done: 2, remaining: 1 },
                })}
            />
        )

        expect(screen.getByTestId('weekly-goal-strength-value')).toHaveTextContent('2 / 3')
        expect(screen.getByTestId('weekly-goal-strength-remaining')).toHaveTextContent(
            '1 more strength session to go'
        )
        expect(screen.queryByTestId('weekly-goal-distance')).toBeNull()
    })

    it('shows the empty state linking to /settings?tab=goals when the mode has no goal', () => {
        render(
            <WeeklyGoalsCardView
                mode="strength"
                progress={progressOf({ longRuns: { goal: 1, done: 0, remaining: 1 } })}
            />
        )

        expect(screen.getByTestId('weekly-goals-empty')).toHaveTextContent(
            'Set weekly goals to see what is left this week'
        )
        expect(screen.getByTestId('weekly-goals-empty-link')).toHaveAttribute(
            'href',
            '/settings?tab=goals'
        )
    })

    it('shows 4 days left, and Last day on Sunday', () => {
        const goals = { strengthSessions: { goal: 3, done: 0, remaining: 3 } }
        const { rerender } = render(
            <WeeklyGoalsCardView mode="strength" progress={progressOf(goals)} />
        )
        expect(screen.getByTestId('weekly-goals-days-left')).toHaveTextContent('4 days left')

        rerender(
            <WeeklyGoalsCardView mode="strength" progress={progressOf({ ...goals, daysLeft: 1 })} />
        )
        expect(screen.getByTestId('weekly-goals-days-left')).toHaveTextContent('Last day')
    })

    it('reserves its height while loading', () => {
        render(<WeeklyGoalsCardLoading />)

        expect(screen.getByTestId('weekly-goals-loading')).toHaveAttribute('aria-busy', 'true')
        expect(screen.getByTestId('weekly-goals-loading')).toHaveClass('min-h-40')
    })
})
