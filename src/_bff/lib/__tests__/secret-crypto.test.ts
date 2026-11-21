// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret } from '@/_bff/lib/secret-crypto'

const KEY = Buffer.alloc(32, 7).toString('base64')
const NAMES = { provider: 'Acme', secret: 'token' }

describe('secret encryption', () => {
    it('round trips and never leaves the plain text in the payload', () => {
        const payload = encryptSecret('plain-secret', KEY, NAMES)

        expect(payload.startsWith('v1.')).toBe(true)
        expect(payload).not.toContain('plain-secret')
        expect(decryptSecret(payload, KEY, NAMES)).toBe('plain-secret')
    })

    it('encrypts the same text differently every time', () => {
        expect(encryptSecret('same', KEY, NAMES)).not.toBe(encryptSecret('same', KEY, NAMES))
    })

    it('rejects a tampered payload with the provider in the message', () => {
        const [version, nonce, tag, encoded] = encryptSecret('plain-secret', KEY, NAMES).split('.')
        const ciphertext = Buffer.from(encoded ?? '', 'base64')
        ciphertext[0] = (ciphertext[0] ?? 0) ^ 1

        expect(() =>
            decryptSecret(
                [version, nonce, tag, ciphertext.toString('base64')].join('.'),
                KEY,
                NAMES
            )
        ).toThrow()
        expect(() => decryptSecret('v1.broken', KEY, NAMES)).toThrow(
            'Invalid encrypted Acme credential'
        )
    })

    it('rejects an empty secret and a key that is not 32 bytes of base64', () => {
        expect(() => encryptSecret('', KEY, NAMES)).toThrow('Acme token cannot be empty')
        expect(() => encryptSecret('x', 'wrong', NAMES)).toThrow('Invalid Acme encryption key')
    })
})
