import { coachModelLabel } from '@/_bff/core/constants/coach-models.constants'

type Props = { modelId: string | null }

// Names the model that wrote the latest reply, under the message box.
export function CoachModelCaption({ modelId }: Props) {
    if (modelId === null) return null
    return (
        <p
            data-testid="coach-model-caption"
            className="truncate px-3 pb-2 text-xs text-muted-foreground"
        >
            Current model: {coachModelLabel(modelId)}
        </p>
    )
}
