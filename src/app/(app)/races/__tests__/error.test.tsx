import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import RacesError from '@/app/(app)/races/error'

const mocks = vi.hoisted(() => ({ error: vi.fn() }))

vi.mock('sonner', () => ({ toast: { error: mocks.error } }))

describe('RacesError', () => {
    it('toasts fixed copy, never the error message, and renders nothing', () => {
        const { container } = render(<RacesError error={new Error('secret_internal_hash')} />)

        expect(mocks.error).toHaveBeenCalledWith('Could not load your races. Please try again.', {
            id: 'races-error',
        })
        expect(JSON.stringify(mocks.error.mock.calls)).not.toContain('secret_internal_hash')
        expect(container).toBeEmptyDOMElement()
    })
})
