// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
    decryptLyftaApiKey,
    encryptLyftaApiKey,
} from '@/_bff/modules/lyfta/utils/credentials.utils'

const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')

describe('Lyfta credential encryption', () => {
    it('encrypts credentials with a versioned authenticated payload and decrypts them', () => {
        const apiKey = 'lyfta-private-key'
        const payload = encryptLyftaApiKey(apiKey, ENCRYPTION_KEY)

        expect(payload.startsWith('v1.')).toBe(true)
        expect(payload).not.toContain(apiKey)
        expect(decryptLyftaApiKey(payload, ENCRYPTION_KEY)).toBe(apiKey)
    })

    it('rejects a tampered encrypted credential', () => {
        const payload = encryptLyftaApiKey('lyfta-private-key', ENCRYPTION_KEY)
        const [version, nonce, tag, encodedCiphertext] = payload.split('.')
        const ciphertext = Buffer.from(encodedCiphertext ?? '', 'base64')
        if (ciphertext.length === 0) throw new Error('Expected non-empty test ciphertext')
        ciphertext[0] = (ciphertext[0] ?? 0) ^ 1

        expect(() =>
            decryptLyftaApiKey(
                [version, nonce, tag, ciphertext.toString('base64')].join('.'),
                ENCRYPTION_KEY
            )
        ).toThrow()
    })

    it('rejects malformed encryption keys and payload versions', () => {
        const payload = encryptLyftaApiKey('lyfta-private-key', ENCRYPTION_KEY)

        expect(() => encryptLyftaApiKey('key', 'wrong')).toThrow()
        expect(() => decryptLyftaApiKey(payload.replace('v1.', 'v2.'), ENCRYPTION_KEY)).toThrow()
    })
})
