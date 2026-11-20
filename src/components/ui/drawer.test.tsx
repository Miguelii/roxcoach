import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Drawer, DrawerContent } from '@/components/ui/drawer'

const stubMatchMedia = (isMobile: boolean) => {
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches: isMobile && query === '(max-width: 767px)',
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
    }))
}

describe('Drawer', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('opens from the right on desktop by default', () => {
        stubMatchMedia(false)

        render(
            <Drawer open>
                <DrawerContent data-testid="drawer-content">Drawer content</DrawerContent>
            </Drawer>
        )

        expect(screen.getByTestId('drawer-content')).toHaveAttribute(
            'data-vaul-drawer-direction',
            'right'
        )
    })

    it('opens from the bottom on mobile by default', () => {
        stubMatchMedia(true)

        render(
            <Drawer open>
                <DrawerContent data-testid="drawer-content">Drawer content</DrawerContent>
            </Drawer>
        )

        expect(screen.getByTestId('drawer-content')).toHaveAttribute(
            'data-vaul-drawer-direction',
            'bottom'
        )
    })

    it('respects an explicitly provided direction', () => {
        stubMatchMedia(false)

        render(
            <Drawer open direction="top">
                <DrawerContent data-testid="drawer-content">Drawer content</DrawerContent>
            </Drawer>
        )

        expect(screen.getByTestId('drawer-content')).toHaveAttribute(
            'data-vaul-drawer-direction',
            'top'
        )
    })
})
