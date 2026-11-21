import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

type SecretNames = {
    // The integration the secret belongs to, used in error messages.
    provider: string
    // What the secret is called, for example "API key".
    secret: string
}

const VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'
const NONCE_BYTES = 12
const TAG_BYTES = 16

function decodeEncryptionKey(encodedKey: string, names: SecretNames): Buffer {
    const key = Buffer.from(encodedKey, 'base64')
    if (key.byteLength !== 32 || key.toString('base64') !== encodedKey) {
        throw new Error(`Invalid ${names.provider} encryption key`)
    }
    return key
}

function decodePayloadPart(part: string, names: SecretNames): Buffer {
    const decoded = Buffer.from(part, 'base64')
    if (decoded.toString('base64') !== part) {
        throw new Error(`Invalid encrypted ${names.provider} credential`)
    }
    return decoded
}

export function encryptSecret(plain: string, encodedKey: string, names: SecretNames): string {
    if (plain.length === 0) throw new Error(`${names.provider} ${names.secret} cannot be empty`)

    const nonce = randomBytes(NONCE_BYTES)
    const cipher = createCipheriv(ALGORITHM, decodeEncryptionKey(encodedKey, names), nonce)
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()

    return [
        VERSION,
        nonce.toString('base64'),
        tag.toString('base64'),
        ciphertext.toString('base64'),
    ].join('.')
}

export function decryptSecret(payload: string, encodedKey: string, names: SecretNames): string {
    const [version, encodedNonce, encodedTag, encodedCiphertext, ...extra] = payload.split('.')
    if (
        version !== VERSION ||
        encodedNonce === undefined ||
        encodedTag === undefined ||
        encodedCiphertext === undefined ||
        extra.length > 0
    ) {
        throw new Error(`Invalid encrypted ${names.provider} credential`)
    }

    const nonce = decodePayloadPart(encodedNonce, names)
    const tag = decodePayloadPart(encodedTag, names)
    const ciphertext = decodePayloadPart(encodedCiphertext, names)
    if (nonce.byteLength !== NONCE_BYTES || tag.byteLength !== TAG_BYTES) {
        throw new Error(`Invalid encrypted ${names.provider} credential`)
    }

    const decipher = createDecipheriv(ALGORITHM, decodeEncryptionKey(encodedKey, names), nonce)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
