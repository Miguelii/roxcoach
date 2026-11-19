import type { NextRequest } from 'next/server'
import { setCSP } from '@/lib/set-csp'
import { sbProxy } from '@/lib/utils.server'

export async function proxy(request: NextRequest) {
    return setCSP(await sbProxy(request))
}

export const config = {
    matcher: [
        '/((?!_next|api/|assets|favicon|robots[.]txt|sw[.]js|apple-touch-icon|web-app-manifest|android-chrome).*)',
    ],
}
