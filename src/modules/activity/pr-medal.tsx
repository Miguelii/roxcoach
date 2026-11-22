import { cn } from '@/lib/utils'

type Props = {
    className?: string
    testId?: string
}

export function PrMedal({ className, testId }: Props) {
    return (
        <svg
            data-testid={testId}
            viewBox="0 0 32 32"
            aria-hidden="true"
            className={cn('size-9 shrink-0', className)}
        >
            <path d="M8 2h6l2.6 7.2L19 2h6l-4.6 11h-7.8z" className="fill-amber-deep" />
            <path d="M11 2h2.4l3.2 8.4L19.6 2H22l-4 10h-3z" className="fill-amber" />
            <circle
                cx="16"
                cy="20.5"
                r="9"
                className="fill-amber stroke-amber-deep"
                strokeWidth="1.5"
            />
            <text
                x="16"
                y="24"
                textAnchor="middle"
                className="fill-on-brand font-sans text-[9.5px] font-bold"
            >
                PR
            </text>
        </svg>
    )
}
