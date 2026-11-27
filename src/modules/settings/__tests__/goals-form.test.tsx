import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DEFAULT_RUN_TYPE_RULES } from '@/_bff/core/constants/weekly-goals.constants'
import { describeRunTypeRules } from '@/_bff/core/utils/weekly-goals.utils'
import { GoalsForm } from '@/modules/settings/goals-form'
import type { GoalsFormValues } from '@/modules/settings/use-goals-form'

const DEFAULTS: GoalsFormValues = {
    weeklyRunKm: '',
    longRunsPerWeek: '',
    fastRunsPerWeek: '',
    strengthSessionsPerWeek: '',
    shortRunMaxKm: '3',
    longRunMinKm: '6',
    fastPace: '5:00',
}

describe('GoalsForm', () => {
    it('shows the rule summary for the current thresholds', async () => {
        render(<GoalsForm defaults={DEFAULTS} onSubmit={vi.fn()} />)
        expect(screen.getByTestId('goals-rule-summary')).toHaveTextContent(
            describeRunTypeRules(DEFAULT_RUN_TYPE_RULES)
        )
        fireEvent.change(screen.getByTestId('goals-long-run-km'), { target: { value: '8' } })
        await waitFor(() =>
            expect(screen.getByTestId('goals-rule-summary')).toHaveTextContent(
                describeRunTypeRules({ ...DEFAULT_RUN_TYPE_RULES, longRunMinM: 8000 })
            )
        )
    })

    it('sends the converted values on save', async () => {
        const onSubmit = vi.fn().mockResolvedValue(null)
        render(<GoalsForm defaults={DEFAULTS} onSubmit={onSubmit} />)
        fireEvent.change(screen.getByTestId('goals-weekly-km'), { target: { value: '20' } })
        fireEvent.change(screen.getByTestId('goals-long-runs'), { target: { value: '1' } })
        fireEvent.change(screen.getByTestId('goals-fast-pace'), { target: { value: '4:30' } })
        fireEvent.click(screen.getByTestId('goals-save'))
        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
        expect(onSubmit).toHaveBeenCalledWith({
            weeklyRunDistanceM: 20000,
            longRunsPerWeek: 1,
            fastRunsPerWeek: null,
            strengthSessionsPerWeek: null,
            runTypeRules: { shortRunMaxM: 3000, longRunMinM: 6000, fastPaceSPerKm: 270 },
        })
    })

    it('shows a field error and does not save an invalid pace', async () => {
        const onSubmit = vi.fn()
        render(<GoalsForm defaults={DEFAULTS} onSubmit={onSubmit} />)
        fireEvent.change(screen.getByTestId('goals-fast-pace'), { target: { value: 'abc' } })
        fireEvent.click(screen.getByTestId('goals-save'))
        expect(await screen.findByTestId('goals-fast-pace-error')).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })
})
