import 'server-only'

import { Effect } from 'effect'
import type { z } from 'zod'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    StravaApiError,
    StravaNotFoundError,
    StravaRateLimitedError,
    StravaUnauthorizedError,
} from '@/_bff/lib/errors'
import { STRAVA_API_BASE } from '@/_bff/modules/strava/constants'

type ErrorCodes = {
    unauthorized: ErrorCode
    notFound: ErrorCode | null
    rateLimited: ErrorCode
    fetch: ErrorCode
    http: ErrorCode
    parse: ErrorCode
}

type RequestOptions<T> = {
    url: string
    init: RequestInit
    schema: z.ZodType<T>
    codes: ErrorCodes
    // Values that must never reach an error (tokens, secrets).
    secrets: readonly string[]
}

const API_CODES: ErrorCodes = {
    unauthorized: ErrorCode.STRAVA_API_UNAUTHORIZED,
    notFound: ErrorCode.STRAVA_API_NOT_FOUND,
    rateLimited: ErrorCode.STRAVA_API_RATE_LIMITED,
    fetch: ErrorCode.STRAVA_API_FETCH,
    http: ErrorCode.STRAVA_API_HTTP,
    parse: ErrorCode.STRAVA_API_PARSE,
}

const OAUTH_CODES: ErrorCodes = {
    unauthorized: ErrorCode.STRAVA_OAUTH_UNAUTHORIZED,
    notFound: null,
    rateLimited: ErrorCode.STRAVA_OAUTH_RATE_LIMITED,
    fetch: ErrorCode.STRAVA_OAUTH_FETCH,
    http: ErrorCode.STRAVA_OAUTH_HTTP,
    parse: ErrorCode.STRAVA_OAUTH_PARSE,
}

// Masks every secret in a message. Only the message text is ever kept as a cause, never the
// original error object, because that could carry request headers or bodies.
const redact = (text: string, secrets: readonly string[]): string => {
    let masked = text
    for (const secret of secrets) if (secret) masked = masked.split(secret).join('[redacted]')
    return masked
}

const parseRetryAfter = (header: string | null): number | null => {
    if (header === null) return null
    if (header.trim() === '') return null
    const seconds = Math.trunc(Number(header))
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
}

const request = <T>({ url, init, schema, codes, secrets }: RequestOptions<T>) =>
    Effect.gen(function* () {
        const response = yield* Effect.tryPromise({
            try: () => fetch(url, init),
            catch: (cause) =>
                new StravaApiError({
                    cause: redact(
                        cause instanceof Error
                            ? `${cause.name}: ${cause.message}`
                            : 'unknown error',
                        secrets
                    ),
                    error_hash: codes.fetch,
                    status: null,
                }),
        })

        const { status } = response

        if (status === 401 || status === 403)
            return yield* new StravaUnauthorizedError({
                cause: `HTTP ${status}`,
                error_hash: codes.unauthorized,
            })

        if (status === 404 && codes.notFound !== null)
            return yield* new StravaNotFoundError({
                cause: `HTTP ${status}`,
                error_hash: codes.notFound,
            })

        if (status === 429)
            return yield* new StravaRateLimitedError({
                cause: `HTTP ${status}`,
                error_hash: codes.rateLimited,
                retryAfterS: parseRetryAfter(response.headers.get('Retry-After')),
            })

        if (!response.ok)
            return yield* new StravaApiError({
                cause: `HTTP ${status}`,
                error_hash: codes.http,
                status,
            })

        const body = yield* Effect.tryPromise({
            try: () => response.json(),
            catch: (cause) =>
                new StravaApiError({
                    cause: redact(
                        cause instanceof Error
                            ? `${cause.name}: ${cause.message}`
                            : 'unknown error',
                        secrets
                    ),
                    error_hash: codes.parse,
                    status,
                }),
        })

        const parsed = schema.safeParse(body)
        if (!parsed.success)
            return yield* new StravaApiError({
                cause: `Response failed schema validation: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
                error_hash: codes.parse,
                status,
            })

        return parsed.data
    })

export const stravaApiGet = <T>(
    path: string,
    accessToken: string,
    schema: z.ZodType<T>,
    query?: Record<string, string | number>
) => {
    const search = query
        ? `?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString()}`
        : ''

    return request({
        url: `${STRAVA_API_BASE}${path}${search}`,
        init: { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } },
        schema,
        codes: API_CODES,
        secrets: [accessToken],
    }).pipe(Effect.withSpan('stravaApiGet'))
}

// Form-encoded POST for token exchange, refresh and deauthorize. A 404 is not mapped specially.
export const stravaOAuthPost = <T>(
    url: string,
    body: Record<string, string>,
    schema: z.ZodType<T>
) => {
    const effect = request({
        url,
        init: {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(body).toString(),
        },
        schema,
        codes: OAUTH_CODES,
        secrets: Object.values(body),
    })

    // SAFETY: OAUTH_CODES.notFound is null, so request never fails with StravaNotFoundError here.
    return effect.pipe(Effect.withSpan('stravaOAuthPost')) as Effect.Effect<
        T,
        StravaUnauthorizedError | StravaRateLimitedError | StravaApiError
    >
}
