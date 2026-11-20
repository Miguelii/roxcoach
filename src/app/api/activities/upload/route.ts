import { Effect, Exit } from 'effect'
import { getSession } from '@/_bff/modules/auth/services/get-session.service'
import { createUploadHandler } from '@/_bff/modules/training/helpers/upload-handler.helper'
import { uploadActivity } from '@/_bff/modules/training/services/upload-activity.service'

// The proxy matcher excludes `api/`, so this route authenticates itself: `getSession()` asks
// Supabase Auth through `getUser()` (not the JWT claims) and the handler checks the access flag.
// A failed session lookup is treated as no user.
const handler = createUploadHandler({
    getUser: async () => {
        const exit = await Effect.runPromiseExit(getSession())
        return Exit.isSuccess(exit) ? exit.value : null
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
