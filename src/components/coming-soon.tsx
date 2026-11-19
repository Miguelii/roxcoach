type Props = {
    title: string
    description: string
}

/** Honest placeholder for a screen whose backend has not shipped yet. */
export function ComingSoon({ title, description }: Props) {
    return (
        <section data-testid="coming-soon" className="space-y-3">
            <p className="eyebrow text-muted-foreground">Coming soon</p>
            <h1 data-testid="coming-soon-title" className="display display-section">
                {title}
            </h1>
            <p data-testid="coming-soon-description" className="max-w-prose text-muted-foreground">
                {description}
            </p>
        </section>
    )
}
