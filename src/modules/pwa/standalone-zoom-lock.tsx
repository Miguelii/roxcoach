'use client'

import { useEffect } from 'react'
import { isStandalone } from '@/modules/pwa/utils'

// Keeps the installed app at its own scale, like a native app: no pinch or double-tap zoom, and
// no iOS zoom on focusing a small input. In a browser tab zoom stays available (accessibility).
// The CSS `touch-action` rule in globals.css covers Chrome; iOS needs the viewport limit and its
// `gesturestart` event blocked.
export function StandaloneZoomLock() {
    useEffect(() => {
        if (!isStandalone()) return

        const meta = document.querySelector('meta[name="viewport"]')
        const previous = meta?.getAttribute('content') ?? null
        if (meta !== null && previous !== null)
            meta.setAttribute('content', `${previous}, maximum-scale=1, user-scalable=no`)

        const block = (event: Event) => event.preventDefault()
        document.addEventListener('gesturestart', block)

        return () => {
            document.removeEventListener('gesturestart', block)
            if (meta !== null && previous !== null) meta.setAttribute('content', previous)
        }
    }, [])

    return null
}
