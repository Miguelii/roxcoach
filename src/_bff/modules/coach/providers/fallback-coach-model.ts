import type {
    CoachModel,
    CoachModelRequest,
    CoachStreamEvent,
} from '@/_bff/modules/coach/providers/coach-model'

type FailureKind = 'rate_limited' | 'unavailable'

type Options = {
    onFallback?: (entry: { modelId: string; kind: FailureKind }) => void
    // Total time after which no further model is started. A streaming model is never interrupted.
    deadlineMs?: number
    now?: () => number
}

// Tries the models in order. A model that fails before its first text is discarded and the next
// one gets the identical request. Once text has been emitted the reply is committed to that model
// and everything after passes through. The `model` event is emitted right before the first text.
export const createFallbackCoachModel = (
    models: CoachModel[],
    options: Options = {}
): CoachModel => {
    const { deadlineMs, now = Date.now } = options
    const [first] = models
    if (first === undefined)
        throw new RangeError('createFallbackCoachModel needs at least one model')

    async function* stream(request: CoachModelRequest): AsyncGenerator<CoachStreamEvent> {
        const { signal } = request
        const start = now()
        const failures: FailureKind[] = []
        let switchedFrom: string | null = null

        for (const [index, model] of models.entries()) {
            if (signal.aborted) return
            if (index > 0 && deadlineMs !== undefined && now() - start >= deadlineMs) break
            let failure: FailureKind | null = null
            let committed = false

            try {
                // oxlint-disable-next-line no-await-in-loop -- events must be consumed in order
                for await (const event of model.stream(request)) {
                    if (signal.aborted) return
                    // The wrapper alone announces the model: drop any provider-emitted event.
                    if (event.type === 'model') continue
                    if (committed) {
                        yield event
                        continue
                    }
                    if (event.type === 'text') {
                        committed = true
                        yield { type: 'model', modelId: model.modelId, switchedFrom }
                        yield event
                    } else if (
                        event.type === 'error' &&
                        (event.kind === 'rate_limited' || event.kind === 'unavailable')
                    ) {
                        failure = event.kind
                        break
                    } else {
                        yield event
                        return
                    }
                }
                if (failure === null && !committed) failure = 'unavailable'
            } catch (error) {
                if (signal.aborted) return
                // After text the reply is committed: let the caller see the failure unchanged.
                if (committed) throw error
                failure = 'unavailable'
            }

            // An aborted request records no failure and never calls onFallback.
            if (signal.aborted) return
            if (committed) return
            if (failure === null) return
            failures.push(failure)
            options.onFallback?.({ modelId: model.modelId, kind: failure })
            switchedFrom = model.modelId
        }

        if (signal.aborted) return
        yield {
            type: 'error',
            kind: failures.every((kind) => kind === 'rate_limited')
                ? 'rate_limited'
                : 'unavailable',
        }
    }

    return { modelId: first.modelId, stream }
}
