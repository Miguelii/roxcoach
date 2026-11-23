import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LogsSkeleton } from '@/modules/logs/logs-skeleton'

describe('LogsSkeleton', () => {
    it('marks the placeholder as busy while the logs load', () => {
        render(<LogsSkeleton />)

        expect(screen.getByTestId('logs-skeleton')).toHaveAttribute('aria-busy', 'true')
    })
})
