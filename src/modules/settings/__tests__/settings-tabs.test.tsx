import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SettingsTabs } from '@/modules/settings/settings-tabs'

const panels = {
    profile: <div data-testid="panel-profile" />,
    availability: <div data-testid="panel-availability" />,
}

describe('SettingsTabs', () => {
    it('shows the profile tab by default', () => {
        render(<SettingsTabs profile={panels.profile} availability={panels.availability} />)
        expect(screen.getByTestId('panel-profile')).toBeInTheDocument()
        expect(screen.queryByTestId('panel-availability')).not.toBeInTheDocument()
    })

    it('switches to weekly availability', async () => {
        render(<SettingsTabs profile={panels.profile} availability={panels.availability} />)
        fireEvent.click(screen.getByTestId('settings-tab-availability'))
        expect(await screen.findByTestId('panel-availability')).toBeInTheDocument()
    })
})
