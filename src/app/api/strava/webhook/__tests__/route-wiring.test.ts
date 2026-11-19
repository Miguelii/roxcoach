// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { GET, POST } from '@/app/api/strava/webhook/route'

vi.mock('@/env/server', () => ({ ServerEnv: {} }))
vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger: vi.fn() } }))

describe('webhook route wiring', () => {
    it('exports a GET that answers 403 when no verify token is configured', async () => {
        const response = await GET(
            new Request(
                'https://roxcoach.test/api/strava/webhook?hub.mode=subscribe&hub.challenge=abc&hub.verify_token=x'
            )
        )

        expect(response.status).toBe(403)
    })

    it('exports a POST that answers 400 for a body that is not JSON', async () => {
        const response = await POST(
            new Request('https://roxcoach.test/api/strava/webhook', {
                method: 'POST',
                body: 'not json',
            })
        )

        expect(response.status).toBe(400)
    })
})
