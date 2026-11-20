'use client'

import { Button } from '@/components/ui/button'

type Props = {
    error: unknown
    retry: () => void
}

// Fixed copy only: the error message is never rendered. Next 16 passes `retry`, which re-fetches
// the server data (unlike `reset`, which only re-renders).
export default function RacesError({ retry }: Props) {
    return (
        <div data-testid="races-error" role="alert" className="grid gap-3">
            <p data-testid="races-error-message" className="text-sm text-muted-foreground">
                Could not load your races. Please try again.
            </p>
            <Button
                data-testid="races-error-retry"
                type="button"
                variant="outline"
                className="w-fit"
                onClick={() => retry()}
            >
                Try again
            </Button>
        </div>
    )
}
