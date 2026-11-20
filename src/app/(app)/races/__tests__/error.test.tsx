import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import RacesError from '@/app/(app)/races/error'

describe('RacesError', () => {
    it('shows fixed copy, never the error message, and retries on click', () => {
        const retry = vi.fn()
        render(<RacesError error={new Error('secret_internal_hash')} retry={retry} />)
        expect(screen.getByTestId('races-error-message')).toHaveTextContent(
            'Could not load your races. Please try again.'
        )
        expect(screen.getByTestId('races-error').textContent).not.toContain('secret_internal_hash')
        fireEvent.click(screen.getByTestId('races-error-retry'))
        expect(retry).toHaveBeenCalledTimes(1)
    })
})
