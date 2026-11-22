'use client'

import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
    "group/button inline-flex shrink-0 disabled:opacity-80! cursor-pointer items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[transform,background-color,box-shadow] duration-200 ease-spring outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-100 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    {
        variants: {
            variant: {
                default: 'bg-ink text-paper hover:bg-ink/90',
                ink: 'bg-ink text-paper hover:bg-ink/90',
                paper: 'bg-paper text-ink hover:bg-sunken',
                white: 'bg-card text-ink shadow-soft ring-1 ring-hairline hover:bg-sunken/60',
                signal: 'bg-signal-strong text-on-brand hover:brightness-95',
                tone: 'bg-tone text-tone-ink hover:brightness-92',
                outline:
                    'bg-card text-ink shadow-soft ring-1 ring-hairline hover:bg-sunken/60 aria-expanded:bg-sunken/60',
                'outline-ink':
                    'border-transparent bg-transparent text-ink shadow-[inset_0_0_0_1.5px_var(--ink)] hover:bg-ink/5',
                secondary: 'bg-sunken text-ink hover:bg-sunken/70 aria-expanded:bg-sunken/70',
                ghost: 'text-muted-foreground hover:bg-sunken hover:text-ink aria-expanded:bg-sunken aria-expanded:text-ink',
                destructive:
                    'bg-red-soft text-red-deep hover:bg-red-soft/80 focus-visible:border-destructive/40 focus-visible:ring-destructive/20',
                link: 'text-primary underline-offset-4 hover:underline',
            },
            size: {
                default:
                    'h-12 md:h-10 gap-2 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4',
                xs: "h-6 gap-1 px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
                sm: "h-7 gap-1 px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
                lg: 'h-12 gap-2 px-6 has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5',
                xl: 'h-14 gap-2.5 px-8 text-base font-bold',
                icon: 'size-8',
                'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3",
                'icon-sm': 'size-7',
                'icon-lg': 'size-9',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    }
)

function Button({
    className,
    variant = 'default',
    size = 'default',
    ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
    return (
        <ButtonPrimitive
            data-slot="button"
            className={cn(buttonVariants({ variant, size, className }))}
            {...props}
        />
    )
}

export { Button, buttonVariants }
