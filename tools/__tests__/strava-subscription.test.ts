// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { PUSH_SUBSCRIPTIONS_URL, readConfig, runCommand } from '../strava-subscription'

const SECRET = 'client-secret-value'
const VERIFY = 'verify-token-value'

const ENV = {
    NEXT_STRAVA_CLIENT_ID: '4242',
    NEXT_STRAVA_CLIENT_SECRET: SECRET,
    NEXT_STRAVA_WEBHOOK_VERIFY_TOKEN: VERIFY,
    NEXT_PUBLIC_WEBSITE_URL: 'https://roxcoach.test/',
}

const firstCall = (calls: Call[]): Call => {
    const [call] = calls
    if (!call) throw new Error('a request was expected')
    return call
}

const config = () => {
    const result = readConfig(ENV)
    if (!result.ok) throw new Error('config expected')
    return result.config
}

type Body = Record<string, string | number> | Array<Record<string, string | number>>

type Call = [url: string, init: RequestInit]

const jsonResponse = (body: Body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('readConfig', () => {
    it('reads the four variables and builds the callback URL without a double slash', () => {
        expect(readConfig(ENV)).toEqual({
            ok: true,
            config: {
                clientId: '4242',
                clientSecret: SECRET,
                verifyToken: VERIFY,
                callbackUrl: 'https://roxcoach.test/api/strava/webhook',
            },
        })
    })

    it('names the missing variables and never their values', () => {
        const result = readConfig({ NEXT_STRAVA_CLIENT_ID: '4242', NEXT_STRAVA_CLIENT_SECRET: '' })
        expect(result).toEqual({
            ok: false,
            missing: [
                'NEXT_STRAVA_CLIENT_SECRET',
                'NEXT_STRAVA_WEBHOOK_VERIFY_TOKEN',
                'NEXT_PUBLIC_WEBSITE_URL',
            ],
        })
    })
})

describe('runCommand', () => {
    it('creates a subscription with a form POST and returns its id', async () => {
        const fetchFn = vi.fn(async (_url: string, _init: RequestInit) =>
            jsonResponse({ id: 77 }, 201)
        )
        const result = await runCommand('create', undefined, config(), fetchFn)

        expect(result).toEqual({ ok: true, message: 'Created subscription 77' })
        const [url, init] = firstCall(fetchFn.mock.calls)
        expect(url).toBe(PUSH_SUBSCRIPTIONS_URL)
        expect(init.method).toBe('POST')
        const form = new URLSearchParams(String(init.body))
        expect(form.get('client_id')).toBe('4242')
        expect(form.get('client_secret')).toBe(SECRET)
        expect(form.get('callback_url')).toBe('https://roxcoach.test/api/strava/webhook')
        expect(form.get('verify_token')).toBe(VERIFY)
    })

    it('views the subscription with the credentials in the query', async () => {
        const fetchFn = vi.fn(async (_url: string, _init: RequestInit) =>
            jsonResponse([{ id: 77, callback_url: 'x' }])
        )
        const result = await runCommand('view', undefined, config(), fetchFn)

        expect(result).toEqual({ ok: true, message: 'Subscription ids: 77' })
        const [url, init] = firstCall(fetchFn.mock.calls)
        expect(init.method).toBe('GET')
        const query = new URL(url).searchParams
        expect(query.get('client_id')).toBe('4242')
        expect(query.get('client_secret')).toBe(SECRET)
    })

    it('reports no subscription when the list is empty', async () => {
        const fetchFn = vi.fn(async (_url: string, _init: RequestInit) => jsonResponse([]))
        expect(await runCommand('view', undefined, config(), fetchFn)).toEqual({
            ok: true,
            message: 'No subscription',
        })
    })

    it('deletes by id', async () => {
        const fetchFn = vi.fn(
            async (_url: string, _init: RequestInit) => new Response(null, { status: 204 })
        )
        const result = await runCommand('delete', '77', config(), fetchFn)

        expect(result).toEqual({ ok: true, message: 'Deleted subscription 77' })
        const [url, init] = firstCall(fetchFn.mock.calls)
        expect(init.method).toBe('DELETE')
        expect(new URL(url).pathname).toBe('/api/v3/push_subscriptions/77')
    })

    it('rejects a delete without a numeric id before any request', async () => {
        const fetchFn = vi.fn(async (_url: string, _init: RequestInit) => new Response(null))
        const results = await Promise.all(
            [undefined, 'abc', '-1'].map((id) => runCommand('delete', id, config(), fetchFn))
        )
        expect(results.map((result) => result.ok)).toEqual([false, false, false])
        expect(fetchFn).not.toHaveBeenCalled()
    })

    it('never prints the secret or the verify token on a failure', async () => {
        const fetchFn = vi.fn(async (_url: string, _init: RequestInit) =>
            jsonResponse({ message: `bad ${SECRET} ${VERIFY}` }, 400)
        )
        const result = await runCommand('create', undefined, config(), fetchFn)
        expect(result.ok).toBe(false)
        const text = JSON.stringify(result)
        expect(text).toContain('400')
        expect(text).not.toContain(SECRET)
        expect(text).not.toContain(VERIFY)
    })

    it('reports a network failure without the cause', async () => {
        const fetchFn = vi.fn(async (_url: string, _init: RequestInit): Promise<Response> => {
            throw new Error(`connect failed ${SECRET}`)
        })
        const result = await runCommand('view', undefined, config(), fetchFn)
        expect(result.ok).toBe(false)
        expect(JSON.stringify(result)).not.toContain(SECRET)
    })
})
