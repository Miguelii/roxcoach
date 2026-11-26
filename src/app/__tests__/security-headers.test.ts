// @vitest-environment node
import { describe, expect, it } from 'vitest'
import nextConfig from '../../../next.config'

const permissionsPolicy = async () => {
    const rules = (await nextConfig.headers?.()) ?? []
    return rules
        .flatMap((rule) => rule.headers)
        .find((header) => header.key === 'Permissions-Policy')?.value
}

describe('Permissions-Policy header', () => {
    it('allows the microphone on our own origin only, for coach voice input', async () => {
        expect(await permissionsPolicy()).toContain('microphone=(self)')
    })

    it('keeps camera, geolocation and browsing-topics denied', async () => {
        const policy = await permissionsPolicy()
        expect(policy).toContain('camera=()')
        expect(policy).toContain('geolocation=()')
        expect(policy).toContain('browsing-topics=()')
    })
})
