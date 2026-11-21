import 'server-only'

import { decryptSecret, encryptSecret } from '@/_bff/lib/secret-crypto'

const NAMES = { provider: 'Lyfta', secret: 'API key' }

export const encryptLyftaApiKey = (apiKey: string, encodedKey: string) =>
    encryptSecret(apiKey, encodedKey, NAMES)

export const decryptLyftaApiKey = (payload: string, encodedKey: string) =>
    decryptSecret(payload, encodedKey, NAMES)
