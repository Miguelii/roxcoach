// @vitest-environment node
import { createDecipheriv } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { Effect, Exit } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import {
    fetchZeppDetail,
    fetchZeppHistory,
    loginToZepp,
} from '@/_bff/modules/zepp/services/zepp-api.service'
import type { ZeppJson } from '@/_bff/modules/zepp/types'
import { parseZeppHistory } from '@/_bff/modules/zepp/utils/schemas.utils'
import { readMock } from '@/_bff/modules/zepp/utils/__tests__/mocks'

const PASSWORD = 'p@ss w0rd&1'
const EMAIL = 'athlete@example.com'
const TOKEN = 'app-token-value'

const json = (body: ZeppJson, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const redirect = (location: string) => new Response(null, { status: 303, headers: { location } })

const loginFetch = () =>
    vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
            redirect('https://example.com/done.html?access=ACCESS&refresh=REFRESH')
        )
        .mockResolvedValueOnce(
            json({ token_info: { app_token: TOKEN, login_token: 'LT', user_id: '1' } })
        )

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromiseExit(effect)

describe('loginToZepp', () => {
    it('returns the app token and sends the credentials only inside the encrypted body', async () => {
        const fetcher = loginFetch()

        const exit = await run(loginToZepp(EMAIL, PASSWORD, { fetch: fetcher }))

        expect(Exit.isSuccess(exit) && exit.value).toBe(TOKEN)
        const [url, init] = fetcher.mock.calls[0] ?? []
        expect(String(url)).toBe('https://api-user-us2.zepp.com/v2/registrations/tokens')
        expect(init?.redirect).toBe('manual')
        // SAFETY: the client sends the encrypted login form as a Uint8Array, asserted by byteLength below.
        const body = Buffer.from(init?.body as Uint8Array)
        expect(body.byteLength % 16).toBe(0)
        expect(body.toString('latin1')).not.toContain(PASSWORD)
        const decipher = createDecipheriv(
            'aes-128-cbc',
            Buffer.from('xeNtBVqzDc6tuNTh'),
            Buffer.from('MAAAYAAAAAAAAABg')
        )
        const plain = Buffer.concat([decipher.update(body), decipher.final()]).toString()
        const form = new URLSearchParams(plain)
        expect(form.get('emailOrPhone')).toBe(EMAIL)
        expect(form.get('password')).toBe(PASSWORD)
        expect(form.get('client_id')).toBe('HuaMi')
        expect(form.getAll('token')).toEqual(['access', 'refresh'])
    })

    it('exchanges the access code on the second call', async () => {
        const fetcher = loginFetch()

        await run(loginToZepp(EMAIL, PASSWORD, { fetch: fetcher }))

        const [url, init] = fetcher.mock.calls[1] ?? []
        expect(String(url)).toBe('https://api-mifit-us2.zepp.com/v2/client/login')
        const form = new URLSearchParams(String(init?.body))
        expect(form.get('code')).toBe('ACCESS')
        expect(form.get('grant_type')).toBe('access_token')
        expect(form.get('device_id')).toBeTruthy()
    })

    it('rejects the login and names the redirect params and the error code, never their other values, when Zepp answers an error', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(
                redirect('https://example.com/done.html?error=access_denied&state=SECRETSTATE')
            )

        const exit = await run(loginToZepp(EMAIL, PASSWORD, { fetch: fetcher }))

        expect(failureTag(exit)).toBe('ZeppLoginRejectedError')
        const cause = JSON.stringify(exit)
        expect(cause).toContain('Zepp redirect has no access code')
        expect(cause).toContain('error, state')
        expect(cause).toContain('access_denied')
        expect(cause).not.toContain('SECRETSTATE')
    })

    it('fails with a response error when the redirect has neither an access code nor an error', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(redirect('https://example.com/done.html?state=S'))

        const exit = await run(loginToZepp(EMAIL, PASSWORD, { fetch: fetcher }))

        expect(failureTag(exit)).toBe('ZeppApiResponseError')
    })

    it('fails with a rejected login when Zepp does not redirect', async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ error: 'bad' }, 200))

        const exit = await run(loginToZepp(EMAIL, PASSWORD, { fetch: fetcher }))

        expect(failureTag(exit)).toBe('ZeppLoginRejectedError')
    })

    it('fails with a response error when the second call has no token', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(redirect('https://example.com/?access=A&refresh=R'))
            .mockResolvedValueOnce(json({ token_info: {} }))

        const exit = await run(loginToZepp(EMAIL, PASSWORD, { fetch: fetcher }))

        expect(failureTag(exit)).toBe('ZeppApiResponseError')
    })

    it('fails with a response error, not a defect, when the redirect is not a URL', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(redirect('http://[broken?access=SECRET&refresh=SECRET2'))

        const exit = await run(loginToZepp(EMAIL, PASSWORD, { fetch: fetcher }))

        expect(failureTag(exit)).toBe('ZeppApiResponseError')
        expect(JSON.stringify(exit)).not.toContain('SECRET')
    })

    it('fails with a request error when the network fails, without leaking the password', async () => {
        const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error(`boom ${PASSWORD}`))

        const exit = await run(loginToZepp(EMAIL, PASSWORD, { fetch: fetcher }))

        expect(failureTag(exit)).toBe('ZeppApiRequestError')
        expect(JSON.stringify(exit)).not.toContain(PASSWORD)
    })
})

describe('fetchZeppHistory', () => {
    it('returns the summaries of the real history and sends the token in a header', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(json(readMock('zepp_history_mock.json')))

        const exit = await run(fetchZeppHistory(TOKEN, { fetch: fetcher }))

        expect(Exit.isSuccess(exit) && exit.value.summaries).toHaveLength(8)
        const [url, init] = fetcher.mock.calls[0] ?? []
        expect(String(url)).toBe('https://api-mifit-us2.zepp.com/v1/sport/run/history.json')
        expect(init?.headers).toMatchObject({ apptoken: TOKEN, appPlatform: 'web' })
        expect(String(url)).not.toContain(TOKEN)
    })

    it.each([
        ['an HTTP 401', () => json({}, 401)],
        ['a 200 with code 0', () => json({ code: 0, message: 'token invalid' })],
        ['a body that is not JSON', () => new Response('<html>', { status: 200 })],
    ])('treats %s as an expired session', async (_name, response) => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response())

        const exit = await run(fetchZeppHistory(TOKEN, { fetch: fetcher }))

        expect(failureTag(exit)).toBe('ZeppSessionExpiredError')
        expect(JSON.stringify(exit)).not.toContain(TOKEN)
    })

    it('fails with a response error on a server error', async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({}, 500))

        expect(failureTag(await run(fetchZeppHistory(TOKEN, { fetch: fetcher })))).toBe(
            'ZeppApiResponseError'
        )
    })

    it('fails with a request error when the network fails', async () => {
        const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'))

        expect(failureTag(await run(fetchZeppHistory(TOKEN, { fetch: fetcher })))).toBe(
            'ZeppApiRequestError'
        )
    })
})

describe('fetchZeppDetail', () => {
    it('asks for the track and source and returns the series of the real detail', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(json(readMock('zepp_detail_mock.json')))
        const summary = parseZeppHistory(readMock('zepp_history_mock.json')).summaries.find(
            (item) => item.sportType === 1
        )
        if (summary === undefined) throw new Error('mock has no run')

        const exit = await run(fetchZeppDetail(TOKEN, summary, { fetch: fetcher }))

        expect(Exit.isSuccess(exit) && exit.value.trackId).toBe('1794943080')
        const url = new URL(String(fetcher.mock.calls[0]?.[0]))
        expect(url.pathname).toBe('/v1/sport/run/detail.json')
        expect(url.searchParams.get('trackid')).toBe('1794943080')
        expect(url.searchParams.get('source')).toBe('run.9765121.huami.com')
    })
})
