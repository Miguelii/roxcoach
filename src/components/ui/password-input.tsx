'use client'

import * as React from 'react'
import { IconEye, IconEyeOff } from '@tabler/icons-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type Props = Omit<React.ComponentProps<'input'>, 'type'> & {
    'data-testid'?: string
    secretName?: string
}

function PasswordInput({
    className,
    disabled,
    secretName = 'password',
    'data-testid': testId,
    ...props
}: Props) {
    const [visible, setVisible] = React.useState(false)
    const Icon = visible ? IconEyeOff : IconEye

    return (
        <div className="relative">
            <Input
                {...props}
                type={visible ? 'text' : 'password'}
                disabled={disabled}
                data-testid={testId}
                className={cn('pr-11', className)}
            />
            <button
                type="button"
                data-testid={testId && `${testId}-toggle`}
                aria-label={`${visible ? 'Hide' : 'Show'} ${secretName}`}
                aria-pressed={visible}
                disabled={disabled}
                onClick={() => setVisible((shown) => !shown)}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
            >
                <Icon className="size-4" aria-hidden="true" />
            </button>
        </div>
    )
}

export { PasswordInput }
