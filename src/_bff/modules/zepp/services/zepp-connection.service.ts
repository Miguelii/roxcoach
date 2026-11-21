import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { createDBAdminClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError, ZeppConfigurationError, ZeppCredentialError } from '@/_bff/lib/errors'
import {
    deleteZeppConnection,
    selectZeppConnection,
    upsertZeppConnection,
} from '@/_bff/modules/zepp/repositories/zepp-connections.repository'
import {
    DEFAULT_ZEPP_DEPS,
    loginToZepp,
    type ZeppDeps,
} from '@/_bff/modules/zepp/services/zepp-api.service'
import type { ZeppConnectionStatus } from '@/_bff/modules/zepp/types'
import { decryptZeppToken, encryptZeppToken } from '@/_bff/modules/zepp/utils/credentials.utils'
import { ServerEnv } from '@/env/server'

type AdminClient = ReturnType<typeof createDBAdminClient>

export type ZeppConnectionDependencies = {
    createAdminClient: () => AdminClient
    encryptionKey: string | undefined
    api: ZeppDeps
}

type ConnectInput = { email: string; password: string }

export const DEFAULT_ZEPP_CONNECTION_DEPENDENCIES: ZeppConnectionDependencies = {
    createAdminClient: createDBAdminClient,
    encryptionKey: ServerEnv.NEXT_ZEPP_ENCRYPTION_KEY,
    api: DEFAULT_ZEPP_DEPS,
}

export const createZeppAdminClient = (dependencies: ZeppConnectionDependencies) =>
    Effect.try({
        try: dependencies.createAdminClient,
        catch: () =>
            new CreateSbClientError({
                cause: 'Could not create the Zepp connection database client',
                error_hash: ErrorCode.ZEPP_CLIENT,
            }),
    })

const requireZeppEncryptionKey = (key: string | undefined) =>
    key === undefined
        ? Effect.fail(
              new ZeppConfigurationError({
                  cause: 'NEXT_ZEPP_ENCRYPTION_KEY is not configured',
                  error_hash: ErrorCode.ZEPP_CONFIGURATION,
              })
          )
        : Effect.succeed(key)

export const getZeppConnectionStatus = Effect.fn('getZeppConnectionStatus')(function* (
    user: User,
    dependencies: ZeppConnectionDependencies = DEFAULT_ZEPP_CONNECTION_DEPENDENCIES
) {
    const supabase = yield* createZeppAdminClient(dependencies)
    const connection = yield* selectZeppConnection(supabase, user.id)
    const status: ZeppConnectionStatus = {
        connected: connection !== null,
        lastSyncedAt: connection?.lastSyncedAt ?? null,
    }
    return status
})

// The password lives only for the login call: only the encrypted app token is stored.
export const connectZepp = Effect.fn('connectZepp')(function* (
    user: User,
    input: ConnectInput,
    dependencies: ZeppConnectionDependencies = DEFAULT_ZEPP_CONNECTION_DEPENDENCIES
) {
    const encryptionKey = yield* requireZeppEncryptionKey(dependencies.encryptionKey)
    const appToken = yield* loginToZepp(input.email, input.password, dependencies.api)
    const encryptedAppToken = yield* Effect.try({
        try: () => encryptZeppToken(appToken, encryptionKey),
        catch: () =>
            new ZeppConfigurationError({
                cause: 'Could not encrypt the Zepp app token',
                error_hash: ErrorCode.ZEPP_CONFIGURATION,
            }),
    })

    const supabase = yield* createZeppAdminClient(dependencies)
    yield* upsertZeppConnection(supabase, user.id, encryptedAppToken)
    const status: ZeppConnectionStatus = { connected: true, lastSyncedAt: null }
    return status
})

export const disconnectZepp = Effect.fn('disconnectZepp')(function* (
    user: User,
    dependencies: ZeppConnectionDependencies = DEFAULT_ZEPP_CONNECTION_DEPENDENCIES
) {
    const supabase = yield* createZeppAdminClient(dependencies)
    yield* deleteZeppConnection(supabase, user.id)
})

export const decryptZeppConnectionToken = Effect.fn('decryptZeppConnectionToken')(function* (
    encryptedAppToken: string,
    encryptionKey: string | undefined
) {
    const key = yield* requireZeppEncryptionKey(encryptionKey)
    return yield* Effect.try({
        try: () => decryptZeppToken(encryptedAppToken, key),
        catch: () =>
            new ZeppCredentialError({
                cause: 'Stored Zepp credential could not be decrypted',
                error_hash: ErrorCode.ZEPP_CREDENTIAL,
            }),
    })
})
