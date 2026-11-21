import 'server-only'

import { decryptSecret, encryptSecret } from '@/_bff/lib/secret-crypto'

const NAMES = { provider: 'Zepp', secret: 'app token' }

export const encryptZeppToken = (token: string, encodedKey: string) =>
    encryptSecret(token, encodedKey, NAMES)

export const decryptZeppToken = (payload: string, encodedKey: string) =>
    decryptSecret(payload, encodedKey, NAMES)
