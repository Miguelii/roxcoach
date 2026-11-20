import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'
const NONCE_BYTES = 12
const TAG_BYTES = 16

function decodeEncryptionKey(encodedKey: string): Buffer {
    const key = Buffer.from(encodedKey, 'base64')
    if (key.byteLength !== 32 || key.toString('base64') !== encodedKey) {
        throw new Error('Invalid Lyfta encryption key')
    }
    return key
}

function decodePayloadPart(part: string): Buffer {
    const decoded = Buffer.from(part, 'base64')
    if (decoded.toString('base64') !== part) throw new Error('Invalid encrypted Lyfta credential')
    return decoded
}

export function encryptLyftaApiKey(apiKey: string, encodedKey: string): string {
    if (apiKey.length === 0) throw new Error('Lyfta API key cannot be empty')

    const nonce = randomBytes(NONCE_BYTES)
    const cipher = createCipheriv(ALGORITHM, decodeEncryptionKey(encodedKey), nonce)
    const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()

    return [
        VERSION,
        nonce.toString('base64'),
        tag.toString('base64'),
        ciphertext.toString('base64'),
    ].join('.')
}

export function decryptLyftaApiKey(payload: string, encodedKey: string): string {
    const [version, encodedNonce, encodedTag, encodedCiphertext, ...extra] = payload.split('.')
    if (
        version !== VERSION ||
        encodedNonce === undefined ||
        encodedTag === undefined ||
        encodedCiphertext === undefined ||
        extra.length > 0
    ) {
        throw new Error('Invalid encrypted Lyfta credential')
    }

    const nonce = decodePayloadPart(encodedNonce)
    const tag = decodePayloadPart(encodedTag)
    const ciphertext = decodePayloadPart(encodedCiphertext)
    if (nonce.byteLength !== NONCE_BYTES || tag.byteLength !== TAG_BYTES) {
        throw new Error('Invalid encrypted Lyfta credential')
    }

    const decipher = createDecipheriv(ALGORITHM, decodeEncryptionKey(encodedKey), nonce)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
