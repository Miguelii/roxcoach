import { NextResponse } from 'next/server'
import { setCSP } from '@/lib/set-csp'

export function proxy() {
    return setCSP(NextResponse.next())
}

export const config = {
    matcher: [
        '/((?!_next|api/|assets|favicon|robots[.]txt|sw[.]js|apple-touch-icon|web-app-manifest|android-chrome).*)',
    ],
}
