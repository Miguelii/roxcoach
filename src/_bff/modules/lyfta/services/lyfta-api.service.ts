import 'server-only'

import { Effect } from 'effect'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    LyftaApiError,
    LyftaApiRequestError,
    LyftaCredentialError,
    LyftaRateLimitError,
    LyftaResponseError,
} from '@/_bff/lib/errors'
import type { LyftaWorkoutRange } from '@/_bff/modules/lyfta/types'
import { parseLyftaWorkoutPage } from '@/_bff/modules/lyfta/utils/workouts.utils'

type LyftaApiFailure =
    | LyftaApiError
    | LyftaApiRequestError
    | LyftaCredentialError
    | LyftaRateLimitError
    | LyftaResponseError
type ApiRequest = {
    apiKey: string
    path: string
    fetcher: typeof fetch
}
type WorkoutPageRequest = {
    apiKey: string
    page: number
    range?: LyftaWorkoutRange
    limit?: number
    fetcher?: typeof fetch
}

const API_BASE_URL = 'https://my.lyfta.app/api/v1'
const REQUEST_TIMEOUT_MS = 10_000
const PAGE_LIMIT = 100

const request = Effect.fn('lyftaApiRequest')(function* ({ apiKey, path, fetcher }: ApiRequest) {
    return yield* Effect.tryPromise({
        try: () =>
            fetcher(`${API_BASE_URL}${path}`, {
                method: 'GET',
                headers: {
                    accept: 'application/json',
                    authorization: `Bearer ${apiKey}`,
                },
                cache: 'no-store',
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            }),
        catch: () =>
            new LyftaApiRequestError({
                cause: 'Lyfta request failed or timed out',
                error_hash: ErrorCode.LYFTA_API_REQUEST,
            }),
    })
})

const failForStatus = (status: number): LyftaApiFailure | null => {
    if (status === 401) {
        return new LyftaCredentialError({
            cause: 'Lyfta rejected the API key',
            error_hash: ErrorCode.LYFTA_CREDENTIAL,
        })
    }
    if (status === 429) {
        return new LyftaRateLimitError({
            cause: 'Lyfta rate limit reached',
            error_hash: ErrorCode.LYFTA_RATE_LIMIT,
        })
    }
    if (status < 200 || status >= 300) {
        return new LyftaApiError({
            cause: `Lyfta returned HTTP ${status}`,
            error_hash: ErrorCode.LYFTA_API_RESPONSE,
        })
    }
    return null
}

const parseResponseJson = Effect.fn('parseLyftaResponseJson')(function* (response: Response) {
    return yield* Effect.tryPromise({
        try: () => response.json(),
        catch: () =>
            new LyftaResponseError({
                cause: 'Lyfta returned invalid JSON',
                error_hash: ErrorCode.LYFTA_API_RESPONSE,
            }),
    })
})

export const fetchLyftaWorkoutPage = Effect.fn('fetchLyftaWorkoutPage')(function* ({
    apiKey,
    page,
    range,
    limit = PAGE_LIMIT,
    fetcher = fetch,
}: WorkoutPageRequest) {
    const url = new URL(`${API_BASE_URL}/workouts`)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('page', String(page))
    if (range?.from !== undefined) url.searchParams.set('from', range.from)
    if (range?.to !== undefined) url.searchParams.set('to', range.to)

    const response = yield* request({
        apiKey,
        path: `/workouts${url.search}`,
        fetcher,
    })
    const statusFailure = failForStatus(response.status)
    if (statusFailure !== null) return yield* statusFailure

    const body = yield* parseResponseJson(response)
    const parsed = parseLyftaWorkoutPage(body, page)

    if (!parsed.success) {
        return yield* new LyftaResponseError({
            cause: `Lyfta response failed validation: ${parsed.issues.join(', ')}`,
            error_hash: ErrorCode.LYFTA_API_RESPONSE,
        })
    }

    return parsed.data
})

export const validateLyftaApiKey = Effect.fn('validateLyftaApiKey')(function* (
    apiKey: string,
    fetcher: typeof fetch = fetch
) {
    const meResponse = yield* request({
        apiKey,
        path: '/me',
        fetcher,
    })
    const meFailure = failForStatus(meResponse.status)
    if (meFailure !== null) return yield* meFailure

    yield* Effect.tryPromise({
        try: () => meResponse.body?.cancel() ?? Promise.resolve(),
        catch: () =>
            new LyftaApiRequestError({
                cause: 'Lyfta response could not be completed',
                error_hash: ErrorCode.LYFTA_API_REQUEST,
            }),
    })

    return yield* fetchLyftaWorkoutPage({
        apiKey,
        page: 1,
        limit: 1,
        fetcher,
    })
})

export type { LyftaApiFailure }
