import type { LogProps } from '@/_bff/lib/log-writer'
import { persistLog } from '@/_bff/lib/server-logger'

type RequestInfo = { method: string; path: string }
type RequestContext = { routePath: string; routeType: string }

// Next awaits `onRequestError`, so the insert is awaited; a failing log never rethrows.
export async function logRequestError(
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Next hands over whatever was thrown
    error: unknown,
    request: RequestInfo,
    context: RequestContext,
    log: (props: LogProps) => Promise<void> = persistLog
): Promise<void> {
    try {
        await log({
            level: 'error',
            prefix: 'request',
            message: `${request.method} ${request.path}`,
            error,
            metadata: { routePath: context.routePath, routeType: context.routeType },
        })
    } catch {
        // persistLog already reports its own failures
    }
}
