'use client'

import { useEffect, useSyncExternalStore } from 'react'

type ViewportBox = { height: number; offsetTop: number }

const subscribe = (onChange: () => void) => {
    const viewport = window.visualViewport
    viewport?.addEventListener('resize', onChange)
    viewport?.addEventListener('scroll', onChange)
    return () => {
        viewport?.removeEventListener('resize', onChange)
        viewport?.removeEventListener('scroll', onChange)
    }
}

const readHeight = () => window.visualViewport?.height ?? null
const readOffsetTop = () => window.visualViewport?.offsetTop ?? 0
const serverHeight = () => null
const serverOffsetTop = () => 0

// The part of the screen the athlete actually sees. On iOS the keyboard shrinks only the visual
// viewport and scrolls the page, so a `fixed inset-0` panel keeps the full height, moves up and
// leaves the page showing under it. Null where the browser has no visualViewport (and on the
// server).
export function useVisualViewport(): ViewportBox | null {
    const height = useSyncExternalStore(subscribe, readHeight, serverHeight)
    const offsetTop = useSyncExternalStore(subscribe, readOffsetTop, serverOffsetTop)
    return height === null ? null : { height, offsetTop }
}

// Stops the page behind an overlay from scrolling while the overlay is mounted.
export function useLockPageScroll() {
    useEffect(() => {
        const root = document.documentElement
        const previous = root.style.overflow
        root.style.overflow = 'hidden'
        return () => {
            root.style.overflow = previous
        }
    }, [])
}
