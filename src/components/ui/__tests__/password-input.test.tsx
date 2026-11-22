import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PasswordInput } from '@/components/ui/password-input'

describe('PasswordInput', () => {
    it('hides the value until the eye is pressed, then hides it again', () => {
        render(<PasswordInput data-testid="secret" defaultValue="hunter2" />)
        const input = screen.getByTestId('secret')
        const toggle = screen.getByTestId('secret-toggle')

        expect(input).toHaveAttribute('type', 'password')
        expect(toggle).toHaveAttribute('aria-label', 'Show password')
        expect(toggle).toHaveAttribute('aria-pressed', 'false')

        fireEvent.click(toggle)
        expect(input).toHaveAttribute('type', 'text')
        expect(toggle).toHaveAttribute('aria-label', 'Hide password')
        expect(toggle).toHaveAttribute('aria-pressed', 'true')

        fireEvent.click(toggle)
        expect(input).toHaveAttribute('type', 'password')
    })

    it('never submits the form it sits in', () => {
        render(<PasswordInput data-testid="secret" />)
        expect(screen.getByTestId('secret-toggle')).toHaveAttribute('type', 'button')
    })

    it('disables the eye with the input', () => {
        render(<PasswordInput data-testid="secret" disabled />)
        expect(screen.getByTestId('secret-toggle')).toBeDisabled()
    })
})
