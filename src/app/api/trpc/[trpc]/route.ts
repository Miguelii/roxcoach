/**
 * This file contains the tRPC http response handler and context creation for Next.js
 */
import { appRouter } from '@/_bff/trpc/router'
import { createContext } from '@/_bff/trpc/context'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'

// A Lyfta sync runs inside this route: it processes a bounded number of pages per call.
export const maxDuration = 60

const handler = (req: Request) =>
    fetchRequestHandler({
        router: appRouter,
        req,
        endpoint: '/api/trpc',
        createContext,
    })

export const GET = handler
export const POST = handler
