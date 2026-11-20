import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SettingsTabs } from '@/modules/settings/settings-tabs'

const panels = {
    profile: <div data-testid="panel-profile" />,
    availability: <div data-testid="panel-availability" />,
}

describe('SettingsTabs', () => {
    it('shows the profile tab by default', () => {
        render(<SettingsTabs profile={panels.profile} availability={panels.availability} />)
        expect(screen.getByTestId('panel-profile')).toBeInTheDocument()
        expect(screen.getByTestId('panel-availability')).not.toBeVisible()
    })

    it('switches to weekly availability', async () => {
        render(<SettingsTabs profile={panels.profile} availability={panels.availability} />)
        fireEvent.click(screen.getByTestId('settings-tab-availability'))
        await waitFor(() => {
            expect(screen.getByTestId('panel-availability')).toBeVisible()
        })
    })

    it('keeps an unsaved edit in one panel after switching tabs and back', async () => {
        render(
            <SettingsTabs
                profile={<input data-testid="profile-input" defaultValue="" />}
                availability={panels.availability}
            />
        )
        fireEvent.change(screen.getByTestId('profile-input'), { target: { value: 'draft' } })
        fireEvent.click(screen.getByTestId('settings-tab-availability'))
        await waitFor(() => {
            expect(screen.getByTestId('panel-availability')).toBeVisible()
        })
        fireEvent.click(screen.getByTestId('settings-tab-profile'))
        await waitFor(() => {
            expect(screen.getByTestId('profile-input')).toBeVisible()
        })
        expect(screen.getByTestId('profile-input')).toHaveValue('draft')
    })
})
