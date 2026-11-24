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

const EMAIL = 'ana@example.com'

describe('ProfileForm', () => {
    it('renders the defaults', () => {
        render(<ProfileForm defaults={DEFAULTS} email={EMAIL} onSubmit={vi.fn()} />)
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
        render(<ProfileForm defaults={DEFAULTS} email={EMAIL} onSubmit={onSubmit} />)
        fireEvent.change(screen.getByTestId('profile-name'), { target: { value: '' } })
        fireEvent.change(screen.getByTestId('profile-max-hr'), { target: { value: '241' } })
        fireEvent.click(screen.getByTestId('profile-submit'))
        expect(await screen.findByTestId('profile-name-error')).toBeInTheDocument()
        expect(screen.getByTestId('profile-max-hr-error')).toBeInTheDocument()
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it('submits converted values', async () => {
        const onSubmit = vi.fn().mockResolvedValue(null)
        render(<ProfileForm defaults={DEFAULTS} email={EMAIL} onSubmit={onSubmit} />)
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
    })

    it('shows the sign-in email read-only and never submits it', async () => {
        const onSubmit = vi.fn().mockResolvedValue(null)
        render(<ProfileForm defaults={DEFAULTS} email={EMAIL} onSubmit={onSubmit} />)

        const email = screen.getByTestId('profile-email')
        expect(email).toHaveValue(EMAIL)
        expect(email).toHaveAttribute('readonly')
        expect(email).not.toHaveAttribute('name')

        fireEvent.click(screen.getByTestId('profile-submit'))
        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
        expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('email')
    })

    it('hides the email field when the account has no email', () => {
        render(<ProfileForm defaults={DEFAULTS} email={null} onSubmit={vi.fn()} />)

        expect(screen.queryByTestId('profile-email')).toBeNull()
    })
})
