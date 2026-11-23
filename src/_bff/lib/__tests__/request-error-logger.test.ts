// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { LogProps } from '@/_bff/lib/log-writer'
import { logRequestError } from '@/_bff/lib/request-error-logger'

const REQUEST = { method: 'POST', path: '/api/coach?x=1' }
const CONTEXT = { routePath: '/api/coach', routeType: 'route' }

const collect = () => {
    const logs: LogProps[] = []
    const log = async (props: LogProps) => {
        logs.push(props)
    }
    return { logs, log }
}

const failingLog = async () => {
    throw new Error('store down')
}

describe('logRequestError', () => {
    it('logs one error row with the method, path and route metadata', async () => {
        const { logs, log } = collect()
        const error = new Error('route exploded')

        await logRequestError(error, REQUEST, CONTEXT, log)

        expect(logs).toEqual([
            {
                level: 'error',
                prefix: 'request',
                message: 'POST /api/coach?x=1',
                error,
                metadata: { routePath: '/api/coach', routeType: 'route' },
            },
        ])
    })

    it('never throws when the log fails', async () => {
        await expect(
            logRequestError(new Error('x'), REQUEST, CONTEXT, failingLog)
        ).resolves.toBeUndefined()
    })
})
