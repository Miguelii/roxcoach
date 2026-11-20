import { coachModelLabel } from '@/_bff/core/constants/coach-models.constants'

type Props = { from: string; to: string }

// Shown before a reply that came from a fallback model. Not an alert.
export function CoachModelSwitchNote({ from, to }: Props) {
    return (
        <p
            data-testid="coach-model-switch-note"
            className="text-center text-xs text-muted-foreground"
        >
            {coachModelLabel(from)} is not available right now. Answering with {coachModelLabel(to)}
            .
        </p>
    )
}
