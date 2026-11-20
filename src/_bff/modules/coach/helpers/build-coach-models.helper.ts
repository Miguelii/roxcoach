import { createFallbackCoachModel } from '@/_bff/modules/coach/providers/fallback-coach-model'
import { createGeminiCoachModel } from '@/_bff/modules/coach/providers/gemini-coach-model'
import type { CoachModel } from '@/_bff/modules/coach/providers/coach-model'

type Options = {
    apiKey: string
    modelIds: ReadonlyArray<string>
    createModel?: typeof createGeminiCoachModel
    log: (entry: { modelId: string; kind: 'rate_limited' | 'unavailable' }) => void
}

// One Gemini model per id, in order, wrapped with the fallback. Throws on an empty list.
export const buildCoachModels = ({
    apiKey,
    modelIds,
    createModel = createGeminiCoachModel,
    log,
}: Options): CoachModel =>
    createFallbackCoachModel(
        modelIds.map((modelId) => createModel({ apiKey, modelId })),
        { onFallback: log }
    )
