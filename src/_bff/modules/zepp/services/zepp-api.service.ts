import 'server-only'

import { createCipheriv, randomUUID } from 'node:crypto'
import { Effect } from 'effect'
import { z } from 'zod'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    ZeppApiRequestError,
    ZeppApiResponseError,
    ZeppLoginRejectedError,
    ZeppSessionExpiredError,
} from '@/_bff/lib/errors'
import {
    ZEPP_DATA_HEADERS,
    ZEPP_LOGIN_CIPHER,
    ZEPP_LOGIN_HEADERS,
    ZEPP_LOGIN_PAYLOAD,
    ZEPP_REQUEST_TIMEOUT_MS,
    ZEPP_TOKENS_HEADERS,
    ZEPP_TOKENS_PAYLOAD,
    ZEPP_URLS,
} from '@/_bff/modules/zepp/constants'
import type { ZeppRunSummary } from '@/_bff/modules/zepp/types'
import { parseZeppDetail, parseZeppHistory } from '@/_bff/modules/zepp/utils/schemas.utils'

export type ZeppDeps = { fetch: typeof fetch }

export const DEFAULT_ZEPP_DEPS: ZeppDeps = { fetch }

const loginResponseSchema = z.object({
    token_info: z.object({ app_token: z.string().min(1) }),
})

// Errors never carry the upstream message: it can echo the credentials that were sent.
const request = Effect.fn('zeppRequest')(function* (
    deps: ZeppDeps,
    url: string,
    init: RequestInit
) {
    return yield* Effect.tryPromise({
        try: () =>
            deps.fetch(url, {
                ...init,
                cache: 'no-store',
                signal: AbortSignal.timeout(ZEPP_REQUEST_TIMEOUT_MS),
            }),
        catch: () =>
            new ZeppApiRequestError({
                cause: 'Zepp request failed or timed out',
                error_hash: ErrorCode.ZEPP_API_REQUEST,
            }),
    })
})

const responseError = (cause: string) =>
    new ZeppApiResponseError({ cause, error_hash: ErrorCode.ZEPP_API_RESPONSE })

// Only the parameter names and Zepp's own `error` code are reported: the other values may carry
// tokens. This is what tells a refused login (error code) from a blocked request (no params).
const describeRedirectWithoutAccess = (params: URLSearchParams | null): string => {
    if (params === null) return 'Zepp redirect has no access code (no Location header)'
    const names = Array.from(new Set(params.keys())).join(', ')
    const errorCode = params.get('error')
    const error = errorCode === null ? '' : `; error: ${errorCode.slice(0, 80)}`
    return `Zepp redirect has no access code (params: ${names || 'none'}${error})`
}

const encryptLoginForm = (form: URLSearchParams) => {
    const cipher = createCipheriv(
        ZEPP_LOGIN_CIPHER.algorithm,
        Buffer.from(ZEPP_LOGIN_CIPHER.key),
        Buffer.from(ZEPP_LOGIN_CIPHER.iv)
    )
    return new Uint8Array(Buffer.concat([cipher.update(form.toString()), cipher.final()]))
}

const requestAccessCode = Effect.fn('zeppRequestAccessCode')(function* (
    email: string,
    password: string,
    deps: ZeppDeps
) {
    const form = new URLSearchParams({
        ...ZEPP_TOKENS_PAYLOAD,
        emailOrPhone: email,
        password,
    })
    form.append('token', 'access')
    form.append('token', 'refresh')

    const response = yield* request(deps, ZEPP_URLS.tokens, {
        method: 'POST',
        headers: ZEPP_TOKENS_HEADERS,
        body: encryptLoginForm(form),
        redirect: 'manual',
    })
    if (response.status !== 303) {
        return yield* new ZeppLoginRejectedError({
            cause: `Zepp answered HTTP ${response.status} instead of a redirect`,
            error_hash: ErrorCode.ZEPP_LOGIN_REJECTED,
        })
    }

    const location = response.headers.get('location')
    // The redirect carries the tokens in its query, so a malformed one must not escape as a defect.
    const redirectParams = yield* Effect.try({
        try: () => (location === null ? null : new URL(location, ZEPP_URLS.tokens).searchParams),
        catch: () => responseError('Zepp redirect is not a valid URL'),
    })
    const access = redirectParams?.get('access') ?? null
    if (access === null || access.length === 0) {
        const cause = describeRedirectWithoutAccess(redirectParams)
        // An `error` in the redirect is Zepp refusing the login (it answered 401 to an athlete whose
        // credentials it did not accept), not a malformed reply.
        if (redirectParams?.has('error')) {
            return yield* new ZeppLoginRejectedError({
                cause,
                error_hash: ErrorCode.ZEPP_LOGIN_REJECTED,
            })
        }
        return yield* responseError(cause)
    }
    return access
})

export const loginToZepp = Effect.fn('loginToZepp')(function* (
    email: string,
    password: string,
    deps: ZeppDeps = DEFAULT_ZEPP_DEPS
) {
    const access = yield* requestAccessCode(email, password, deps)

    const response = yield* request(deps, ZEPP_URLS.login, {
        method: 'POST',
        headers: ZEPP_LOGIN_HEADERS,
        body: new URLSearchParams({
            ...ZEPP_LOGIN_PAYLOAD,
            code: access,
            device_id: randomUUID(),
        }),
    })
    if (response.status !== 200)
        return yield* responseError(`Zepp login returned HTTP ${response.status}`)

    const body = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: () => responseError('Zepp login returned invalid JSON'),
    })
    const parsed = loginResponseSchema.safeParse(body)
    if (!parsed.success) return yield* responseError('Zepp login response has no app token')
    return parsed.data.token_info.app_token
})

const sessionExpired = () =>
    new ZeppSessionExpiredError({
        cause: 'Zepp rejected the app token',
        error_hash: ErrorCode.ZEPP_SESSION_EXPIRED,
    })

// Zepp answers an invalid token with an HTTP error or a body whose `code` is not 1.
const getData = Effect.fn('zeppGetData')(function* (appToken: string, url: string, deps: ZeppDeps) {
    const response = yield* request(deps, url, {
        method: 'GET',
        headers: { ...ZEPP_DATA_HEADERS, apptoken: appToken },
    })
    if (response.status === 401 || response.status === 403) return yield* sessionExpired()
    if (response.status !== 200)
        return yield* responseError(`Zepp returned HTTP ${response.status}`)

    const body = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: sessionExpired,
    })
    const code = z.object({ code: z.number() }).safeParse(body)
    if (!code.success || code.data.code !== 1) return yield* sessionExpired()
    return body
})

export const fetchZeppHistory = Effect.fn('fetchZeppHistory')(function* (
    appToken: string,
    deps: ZeppDeps = DEFAULT_ZEPP_DEPS
) {
    const body = yield* getData(appToken, ZEPP_URLS.history, deps)
    return yield* Effect.try({
        try: () => parseZeppHistory(body),
        catch: () => responseError('Zepp history failed validation'),
    })
})

export const fetchZeppDetail = Effect.fn('fetchZeppDetail')(function* (
    appToken: string,
    summary: ZeppRunSummary,
    deps: ZeppDeps = DEFAULT_ZEPP_DEPS
) {
    const url = new URL(ZEPP_URLS.detail)
    url.searchParams.set('trackid', summary.trackId)
    url.searchParams.set('source', summary.source)
    const body = yield* getData(appToken, url.toString(), deps)
    return yield* Effect.try({
        try: () => parseZeppDetail(body),
        catch: () => responseError('Zepp detail failed validation'),
    })
})
