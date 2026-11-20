import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProfileForm } from '@/modules/settings/profile-form'
import type { ProfileFormValues } from '@/modules/settings/use-profile-form'

const DEFAULTS: ProfileFormValues = {
    displayName: 'Ana',
    timezone: 'Europe/Lisbon',
    maxHr: '190',
    restingHr: '50',
    hyroxDivision: 'open_women',
    weeklyHoursCap: '8',
    notes: 'Left knee',
}

describe('ProfileForm', () => {
    it('renders the defaults', () => {
        render(<ProfileForm defaults={DEFAULTS} onSubmit={vi.fn()} />)
        expect(screen.getByTestId('profile-name')).toHaveValue('Ana')
        expect(screen.getByTestId('profile-max-hr')).toHaveValue('190')
        expect(screen.getByTestId('profile-resting-hr')).toHaveValue('50')
        expect(screen.getByTestId('profile-hours-cap')).toHaveValue('8')
        expect(screen.getByTestId('profile-notes')).toHaveValue('Left knee')
        expect(screen.getByTestId('profile-timezone')).toHaveTextContent('Lisbon')
        expect(screen.getByTestId('profile-division')).toHaveTextContent('Open Women')
    })

    it('shows field errors and does not submit when invalid', async () => {
        const onSubmit = vi.fn()
        render(<ProfileForm defaults={DEFAULTS} onSubmit={onSubmit} />)
        fireEvent.change(screen.getByTestId('profile-name'), { target: { value: '' } })
        fireEvent.change(screen.getByTestId('profile-max-hr'), { target: { value: '241' } })
        fireEvent.click(screen.getByTestId('profile-submit'))
        expect(await screen.findByTestId('profile-name-error')).toBeInTheDocument()
        expect(screen.getByTestId('profile-max-hr-error')).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it('submits converted values and shows the saved note', async () => {
        const onSubmit = vi.fn().mockResolvedValue(null)
        render(<ProfileForm defaults={DEFAULTS} onSubmit={onSubmit} />)
        fireEvent.change(screen.getByTestId('profile-resting-hr'), { target: { value: '' } })
        fireEvent.click(screen.getByTestId('profile-submit'))
        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
        expect(onSubmit).toHaveBeenCalledWith({
            displayName: 'Ana',
            timezone: 'Europe/Lisbon',
            maxHr: 190,
            restingHr: null,
            hyroxDivision: 'open_women',
            weeklyHoursCap: 8,
            notes: 'Left knee',
        })
        expect(await screen.findByTestId('profile-saved')).toBeInTheDocument()
    })
})
