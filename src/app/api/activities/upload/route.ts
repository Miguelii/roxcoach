import { Cause, Effect, Exit } from 'effect'
import { Logger } from '@/_bff/lib/server-logger'
import { getSession } from '@/_bff/modules/auth/services/get-session.service'
import { createUploadHandler } from '@/_bff/modules/training/helpers/upload-handler.helper'
import { uploadActivity } from '@/_bff/modules/training/services/upload-activity.service'

// The proxy matcher excludes `api/`, so this route authenticates itself: `getSession()` asks
// Supabase Auth through `getUser()` (not the JWT claims) and the handler checks the access flag.
// No user is a 401. A failed lookup (typed infrastructure failure or defect) is logged with tag
// and error_hash only and thrown, so the handler answers 500.
export const maxDuration = 60

const handler = createUploadHandler({
    getUser: async () => {
        const exit = await Effect.runPromiseExit(getSession())
        if (Exit.isSuccess(exit)) return exit.value
        const failure = exit.cause.reasons.find(Cause.isFailReason)
        Logger({
            level: 'error',
            prefix: 'uploadSession',
            metadata: {
                tag: failure?.error._tag ?? 'Defect',
                error_hash: failure?.error.error_hash,
            },
        })
        throw new Error('Session lookup failed')
    },
    // Defects reject here and the handler turns them into a generic 500.
    upload: (user, input) =>
        Effect.runPromise(
            uploadActivity(user, input).pipe(
                Effect.match({
                    onSuccess: ({ activityId }) => ({ ok: true as const, activityId }),
                    onFailure: (error) => ({
                        ok: false as const,
                        tag: error._tag,
                        errorHash: error.error_hash,
                    }),
                })
            )
        ),
})

export const POST = (request: Request) => handler(request)
