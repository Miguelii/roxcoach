import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SettingsTabs } from '@/modules/settings/settings-tabs'

const panels = {
    profile: <div data-testid="panel-profile" />,
    dashboard: <div data-testid="panel-dashboard" />,
    goals: <div data-testid="panel-goals" />,
    integrations: <div data-testid="panel-integrations" />,
}

describe('SettingsTabs', () => {
    it('shows the profile tab by default', () => {
        render(
            <SettingsTabs
                profile={panels.profile}
                dashboard={panels.dashboard}
                goals={panels.goals}
                integrations={panels.integrations}
            />
        )
        expect(screen.getByTestId('panel-profile')).toBeInTheDocument()
        expect(screen.queryByTestId('panel-goals')).toBeNull()
        expect(screen.queryByTestId('panel-integrations')).toBeNull()
    })

    it('names the fourth tab Integrations', () => {
        render(
            <SettingsTabs
                profile={panels.profile}
                dashboard={panels.dashboard}
                goals={panels.goals}
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
                goals={panels.goals}
                integrations={panels.integrations}
            />
        )
        expect(screen.queryByTestId('panel-dashboard')).toBeNull()
        fireEvent.click(screen.getByTestId('settings-tab-dashboard'))
        await waitFor(() => {
            expect(screen.getByTestId('panel-dashboard')).toBeVisible()
        })
    })

    it('switches to the goals tab', async () => {
        render(
            <SettingsTabs
                profile={panels.profile}
                dashboard={panels.dashboard}
                goals={panels.goals}
                integrations={panels.integrations}
            />
        )
        fireEvent.click(screen.getByTestId('settings-tab-goals'))
        await waitFor(() => {
            expect(screen.getByTestId('panel-goals')).toBeVisible()
        })
    })

    it('mounts a panel when its tab is first opened and keeps the ones already opened', async () => {
        render(
            <SettingsTabs
                profile={panels.profile}
                dashboard={panels.dashboard}
                goals={panels.goals}
                integrations={panels.integrations}
            />
        )
        fireEvent.click(screen.getByTestId('settings-tab-integrations'))
        await waitFor(() => {
            expect(screen.getByTestId('panel-integrations')).toBeVisible()
        })
        expect(screen.getByTestId('panel-profile')).toBeInTheDocument()
        expect(screen.queryByTestId('panel-goals')).toBeNull()
    })

    it('keeps an unsaved edit in one panel after switching tabs and back', async () => {
        render(
            <SettingsTabs
                profile={<input data-testid="profile-input" defaultValue="" />}
                dashboard={panels.dashboard}
                goals={panels.goals}
                integrations={panels.integrations}
            />
        )
        fireEvent.change(screen.getByTestId('profile-input'), { target: { value: 'draft' } })
        fireEvent.click(screen.getByTestId('settings-tab-goals'))
        await waitFor(() => {
            expect(screen.getByTestId('panel-goals')).toBeVisible()
        })
        fireEvent.click(screen.getByTestId('settings-tab-profile'))
        await waitFor(() => {
            expect(screen.getByTestId('profile-input')).toBeVisible()
        })
        expect(screen.getByTestId('profile-input')).toHaveValue('draft')
    })

    it('opens the goals tab when initialTab is goals', () => {
        render(<SettingsTabs {...panels} initialTab="goals" />)
        expect(screen.getByTestId('panel-goals')).toBeVisible()
        expect(screen.getByTestId('settings-tab-goals')).toHaveTextContent('Goals')
    })

    it('falls back to profile for an unknown tab', () => {
        render(<SettingsTabs {...panels} initialTab="nope" />)
        expect(screen.getByTestId('panel-profile')).toBeVisible()
        expect(screen.queryByTestId('panel-goals')).toBeNull()
    })

    it('has no availability tab', () => {
        render(<SettingsTabs {...panels} />)
        expect(screen.queryByTestId('settings-tab-availability')).toBeNull()
    })
})
