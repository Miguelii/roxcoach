import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ComingSoon } from '@/components/coming-soon'

describe('ComingSoon', () => {
    it('renders the title and the description', () => {
        render(<ComingSoon title="Races" description="Races arrive in a later release." />)

        expect(screen.getByTestId('coming-soon')).toBeInTheDocument()
        expect(screen.getByTestId('coming-soon-title')).toHaveTextContent('Races')
        expect(screen.getByTestId('coming-soon-description')).toHaveTextContent(
            'Races arrive in a later release.'
        )
    })
})
