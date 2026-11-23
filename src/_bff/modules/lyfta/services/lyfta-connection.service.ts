import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { lyftaSyncResultSchema } from '@/_bff/core/constants/lyfta.constants'
import { createDBAdminClient } from '@/_bff/core/db'
import { toSyncState } from '@/_bff/core/helpers/sync-state.helper'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    CreateSbClientError,
    LyftaConfigurationError,
    LyftaCredentialError,
} from '@/_bff/lib/errors'
import {
    selectLyftaConnection,
    upsertLyftaConnection,
    deleteLyftaConnection,
} from '@/_bff/modules/lyfta/repositories/lyfta-connections.repository'
import type { LyftaConnectionRecord, LyftaConnectionStatus } from '@/_bff/modules/lyfta/types'
import {
    decryptLyftaApiKey,
    encryptLyftaApiKey,
} from '@/_bff/modules/lyfta/utils/credentials.utils'
import { validateLyftaApiKey } from '@/_bff/modules/lyfta/services/lyfta-api.service'
import { ServerEnv } from '@/env/server'

type AdminClient = ReturnType<typeof createDBAdminClient>
export type LyftaConnectionDependencies = {
    createAdminClient: () => AdminClient
    encryptionKey: string | undefined
    fetcher: typeof fetch
    now?: () => Date
}

export const DEFAULT_LYFTA_CONNECTION_DEPENDENCIES: LyftaConnectionDependencies = {
    createAdminClient: createDBAdminClient,
    encryptionKey: ServerEnv.NEXT_LYFTA_ENCRYPTION_KEY,
    fetcher: fetch,
}

const createAdminClientEffect = (dependencies: LyftaConnectionDependencies) =>
    Effect.try({
        try: dependencies.createAdminClient,
        catch: () =>
            new CreateSbClientError({
                cause: 'Could not create the Lyfta connection database client',
                error_hash: ErrorCode.LYFTA_CLIENT,
            }),
    })

const requireEncryptionKey = (key: string | undefined) => {
    if (key === undefined) {
        return Effect.fail(
            new LyftaConfigurationError({
                cause: 'NEXT_LYFTA_ENCRYPTION_KEY is not configured',
                error_hash: ErrorCode.LYFTA_CONFIGURATION,
            })
        )
    }
    return Effect.succeed(key)
}

const statusFrom = (
    connection: LyftaConnectionRecord | null,
    now: Date
): LyftaConnectionStatus => ({
    connected: connection !== null,
    lastSyncedAt: connection?.lastSyncedAt ?? null,
    sync: toSyncState(
        connection?.sync ?? null,
        lyftaSyncResultSchema,
        ErrorCode.LYFTA_SYNC_FAILED,
        now
    ),
})

// True when the stored (encrypted) key decrypts to `apiKey`.
const sameStoredKey = (storedEncrypted: string, apiKey: string, encryptionKey: string): boolean => {
    try {
        return decryptLyftaApiKey(storedEncrypted, encryptionKey) === apiKey
    } catch {
        return false
    }
}

export const getLyftaConnectionStatus = Effect.fn('getLyftaConnectionStatus')(function* (
    user: User,
    dependencies: LyftaConnectionDependencies = DEFAULT_LYFTA_CONNECTION_DEPENDENCIES
) {
    const supabase = yield* createAdminClientEffect(dependencies)
    const connection = yield* selectLyftaConnection(supabase, user.id)
    return statusFrom(connection, (dependencies.now ?? (() => new Date()))())
})

export const connectLyfta = Effect.fn('connectLyfta')(function* (
    user: User,
    apiKey: string,
    dependencies: LyftaConnectionDependencies = DEFAULT_LYFTA_CONNECTION_DEPENDENCIES
) {
    const encryptionKey = yield* requireEncryptionKey(dependencies.encryptionKey)
    yield* validateLyftaApiKey(apiKey, dependencies.fetcher)

    const supabase = yield* createAdminClientEffect(dependencies)
    const existing = yield* selectLyftaConnection(supabase, user.id)
    const encryptedApiKey = yield* Effect.try({
        try: () => encryptLyftaApiKey(apiKey, encryptionKey),
        catch: () =>
            new LyftaConfigurationError({
                cause: 'Could not encrypt Lyfta API key',
                error_hash: ErrorCode.LYFTA_CONFIGURATION,
            }),
    })

    // A different key means a different Lyfta account: its history must be imported in full, so
    // the old checkpoint is dropped. An existing key that cannot be decrypted counts as different.
    const keyChanged =
        existing !== null && !sameStoredKey(existing.encryptedApiKey, apiKey, encryptionKey)
    yield* upsertLyftaConnection(supabase, user.id, encryptedApiKey, keyChanged)
    return {
        connected: true,
        lastSyncedAt: keyChanged ? null : (existing?.lastSyncedAt ?? null),
        sync: toSyncState(null, lyftaSyncResultSchema, ErrorCode.LYFTA_SYNC_FAILED, new Date()),
    }
})

export const disconnectLyfta = Effect.fn('disconnectLyfta')(function* (
    user: User,
    dependencies: LyftaConnectionDependencies = DEFAULT_LYFTA_CONNECTION_DEPENDENCIES
) {
    const supabase = yield* createAdminClientEffect(dependencies)
    yield* deleteLyftaConnection(supabase, user.id)
})

export const decryptConnectionKey = Effect.fn('decryptConnectionKey')(function* (
    encryptedApiKey: string,
    encryptionKey: string | undefined
) {
    const key = yield* requireEncryptionKey(encryptionKey)
    return yield* Effect.try({
        try: () => decryptLyftaApiKey(encryptedApiKey, key),
        catch: () =>
            new LyftaCredentialError({
                cause: 'Stored Lyfta credential could not be decrypted',
                error_hash: ErrorCode.LYFTA_CREDENTIAL,
            }),
    })
})
