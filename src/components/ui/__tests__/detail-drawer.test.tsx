import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DetailDrawer } from '@/components/ui/detail-drawer'

const stubMatchMedia = () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
    }))
}

describe('DetailDrawer', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('shows its title, description and children when open', () => {
        stubMatchMedia()
        render(
            <DetailDrawer
                open
                onOpenChange={() => {}}
                title="Log details"
                description="One row"
                testId="detail"
            >
                <p data-testid="detail-body">Body</p>
            </DetailDrawer>
        )

        expect(screen.getByTestId('detail')).toBeInTheDocument()
        expect(screen.getByTestId('detail-title')).toHaveTextContent('Log details')
        expect(screen.getByTestId('detail-description')).toHaveTextContent('One row')
        expect(screen.getByTestId('detail-body')).toHaveTextContent('Body')
    })

    it('asks to close from its close button', () => {
        stubMatchMedia()
        const onOpenChange = vi.fn()
        render(
            <DetailDrawer
                open
                onOpenChange={onOpenChange}
                title="Log details"
                description="One row"
                testId="detail"
            >
                <p>Body</p>
            </DetailDrawer>
        )

        fireEvent.click(screen.getByTestId('detail-close'))

        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('renders nothing when closed', () => {
        stubMatchMedia()
        render(
            <DetailDrawer
                open={false}
                onOpenChange={() => {}}
                title="Log details"
                description="One row"
                testId="detail"
            >
                <p>Body</p>
            </DetailDrawer>
        )

        expect(screen.queryByTestId('detail')).toBeNull()
    })
})
