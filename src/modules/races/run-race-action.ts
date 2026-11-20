import { TRPCClientError } from '@trpc/client'

type Params<Result> = {
    action: () => Promise<Result>
    success: string
    failure: string
    badRequest?: string
    notifySuccess: (message: string) => void
    notifyFailure: (message: string) => void
    onChanged: () => void
}

/**
 * Runs a races mutation. On success it notifies and calls `onChanged` (refresh the server data and
 * invalidate the calendar query); on failure it notifies and rethrows so a dialog stays open. A
 * BAD_REQUEST error uses the `badRequest` copy when given, any other error uses `failure`.
 */
export async function runRaceAction<Result>({
    action,
    success,
    failure,
    badRequest,
    notifySuccess,
    notifyFailure,
    onChanged,
}: Params<Result>) {
    try {
        await action()
    } catch (error) {
        // Only the tRPC error code is read, never the server text.
        const isBadRequest = error instanceof TRPCClientError && error.data?.code === 'BAD_REQUEST'
        notifyFailure(badRequest !== undefined && isBadRequest ? badRequest : failure)
        throw error
    }
    notifySuccess(success)
    onChanged()
}
