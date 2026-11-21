// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { decryptZeppToken, encryptZeppToken } from '@/_bff/modules/zepp/utils/credentials.utils'

const KEY = Buffer.alloc(32, 9).toString('base64')

describe('Zepp token encryption', () => {
    it('round trips a token without leaving it in the payload', () => {
        const payload = encryptZeppToken('zepp-app-token', KEY)

        expect(payload).not.toContain('zepp-app-token')
        expect(decryptZeppToken(payload, KEY)).toBe('zepp-app-token')
    })

    it('names Zepp in its errors', () => {
        expect(() => encryptZeppToken('', KEY)).toThrow('Zepp app token cannot be empty')
        expect(() => decryptZeppToken('nope', KEY)).toThrow('Invalid encrypted Zepp credential')
    })
})
