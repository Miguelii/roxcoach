import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IconHome } from '@tabler/icons-react'
import { MobileNav } from '@/components/mobile-nav'

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))

const ITEMS = [
    { href: '/dashboard', label: 'Dashboard', Icon: IconHome },
    { href: '/calendar', label: 'Calendar', Icon: IconHome },
    { href: '/races', label: 'Races', Icon: IconHome },
    { href: '/settings', label: 'Settings', Icon: IconHome },
]

describe('MobileNav', () => {
    it('falls back to a solid card when transparency is reduced', () => {
        render(<MobileNav items={ITEMS} isActive={() => false} onCoach={() => {}} />)
        const nav = screen.getByTestId('nav-mobile')
        expect(nav.className).toContain('[@media(prefers-reduced-transparency:reduce)]:bg-card')
        expect(nav.className).not.toContain('reduce)]:bg-paper')
    })

    it('floats as white glass with a lifted shadow', () => {
        render(<MobileNav items={ITEMS} isActive={() => false} onCoach={() => {}} />)
        const nav = screen.getByTestId('nav-mobile')
        expect(nav).toHaveClass('bg-white/55', 'backdrop-blur-2xl')
    })
})
