type Params<Result> = {
    action: () => Promise<Result>
    success: string
    failure: string
    notifySuccess: (message: string) => void
    notifyFailure: (message: string) => void
    onChanged: () => void
}

/**
 * Runs a races mutation. On success it notifies and calls `onChanged` (refresh the server data and
 * invalidate the calendar query); on failure it notifies and rethrows so a dialog stays open.
 */
export async function runRaceAction<Result>({
    action,
    success,
    failure,
    notifySuccess,
    notifyFailure,
    onChanged,
}: Params<Result>) {
    try {
        await action()
    } catch (error) {
        notifyFailure(failure)
        throw error
    }
    notifySuccess(success)
    onChanged()
}
