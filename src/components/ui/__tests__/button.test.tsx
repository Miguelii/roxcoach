import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from '@/components/ui/button'

type Size = NonNullable<React.ComponentProps<typeof Button>['size']>

const SIZES: Size[] = ['default', 'xs', 'sm', 'lg', 'xl', 'icon', 'icon-xs', 'icon-sm', 'icon-lg']

const renderButton = (props: React.ComponentProps<typeof Button>) => {
    render(
        <Button data-testid="btn" {...props}>
            Go
        </Button>
    )
    return screen.getByTestId('btn')
}

describe('Button', () => {
    it.each(SIZES)('is a full pill at size %s', (size) => {
        const button = renderButton({ size })
        expect(button).toHaveClass('rounded-full')
        expect(button.className).not.toContain('rounded-[min')
    })

    it('is 48px tall on mobile and 40px from md up', () => {
        const button = renderButton({})
        expect(button).toHaveClass('h-12', 'md:h-10')
        expect(button.className).not.toContain('h-10!')
    })

    it('puts white text only on the strong signal', () => {
        const button = renderButton({ variant: 'signal' })
        expect(button).toHaveClass('bg-signal-strong', 'text-on-brand')
    })

    it('makes the default button ink', () => {
        const button = renderButton({})
        expect(button).toHaveClass('bg-ink')
        expect(button.className).not.toContain('accent-blue')
    })

    it('presses by scaling', () => {
        expect(renderButton({})).toHaveClass('active:scale-[0.97]')
    })

    it('shows a red soft destructive button', () => {
        expect(renderButton({ variant: 'destructive' })).toHaveClass('bg-red-soft', 'text-red-deep')
    })
})
