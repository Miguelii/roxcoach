import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SettingsLogsLink } from '@/modules/settings/settings-logs-link'

describe('SettingsLogsLink', () => {
    it('links to the logs page', () => {
        render(<SettingsLogsLink />)

        expect(screen.getByTestId('settings-logs-link')).toHaveAttribute('href', '/logs')
        expect(screen.getByTestId('settings-logs-link')).toHaveTextContent('Logs')
    })
})
