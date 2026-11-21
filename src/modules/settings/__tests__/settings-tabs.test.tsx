import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SettingsTabs } from '@/modules/settings/settings-tabs'

const panels = {
    profile: <div data-testid="panel-profile" />,
    dashboard: <div data-testid="panel-dashboard" />,
    availability: <div data-testid="panel-availability" />,
    integrations: <div data-testid="panel-integrations" />,
}

describe('SettingsTabs', () => {
    it('shows the profile tab by default', () => {
        render(
            <SettingsTabs
                profile={panels.profile}
                dashboard={panels.dashboard}
                availability={panels.availability}
                integrations={panels.integrations}
            />
        )
        expect(screen.getByTestId('panel-profile')).toBeInTheDocument()
        expect(screen.getByTestId('panel-availability')).not.toBeVisible()
        expect(screen.getByTestId('panel-integrations')).not.toBeVisible()
    })

    it('names the fourth tab Integrations', () => {
        render(
            <SettingsTabs
                profile={panels.profile}
                dashboard={panels.dashboard}
                availability={panels.availability}
                integrations={panels.integrations}
            />
        )
        expect(screen.getByTestId('settings-tab-integrations')).toHaveTextContent('Integrations')
        expect(screen.queryByTestId('settings-tab-lyfta')).toBeNull()
    })

    it('has its own Dashboard tab, apart from the profile', async () => {
        render(
            <SettingsTabs
                profile={panels.profile}
                dashboard={panels.dashboard}
                availability={panels.availability}
                integrations={panels.integrations}
            />
        )
        expect(screen.getByTestId('panel-dashboard')).not.toBeVisible()
        fireEvent.click(screen.getByTestId('settings-tab-dashboard'))
        await waitFor(() => {
            expect(screen.getByTestId('panel-dashboard')).toBeVisible()
        })
    })

    it('switches to weekly availability', async () => {
        render(
            <SettingsTabs
                profile={panels.profile}
                dashboard={panels.dashboard}
                availability={panels.availability}
                integrations={panels.integrations}
            />
        )
        fireEvent.click(screen.getByTestId('settings-tab-availability'))
        await waitFor(() => {
            expect(screen.getByTestId('panel-availability')).toBeVisible()
        })
    })

    it('switches to Integrations while keeping all panels mounted', async () => {
        render(
            <SettingsTabs
                profile={panels.profile}
                dashboard={panels.dashboard}
                availability={panels.availability}
                integrations={panels.integrations}
            />
        )
        fireEvent.click(screen.getByTestId('settings-tab-integrations'))
        await waitFor(() => {
            expect(screen.getByTestId('panel-integrations')).toBeVisible()
        })
        expect(screen.getByTestId('panel-profile')).toBeInTheDocument()
        expect(screen.getByTestId('panel-availability')).toBeInTheDocument()
    })

    it('keeps an unsaved edit in one panel after switching tabs and back', async () => {
        render(
            <SettingsTabs
                profile={<input data-testid="profile-input" defaultValue="" />}
                dashboard={panels.dashboard}
                availability={panels.availability}
                integrations={panels.integrations}
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
