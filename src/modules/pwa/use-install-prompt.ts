'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    INSTALL_PROMPT_DELAY_MS,
    INSTALL_PROMPT_DISMISS_TTL_MS,
    INSTALL_PROMPT_DISMISSED_KEY,
} from '@/modules/pwa/constants'

// The browser's install prompt event (Chrome and Edge, not in the DOM typings).
type InstallPromptEvent = Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallPromptState =
    | { kind: 'hidden' }
    // The browser can show its own install dialog: a button installs at once.
    | { kind: 'native'; install: () => Promise<void>; dismiss: () => void }
    // iOS Safari cannot install from code: the sheet explains the Share menu steps.
    | { kind: 'ios'; dismiss: () => void }

const isInstallPromptEvent = (event: Event): event is InstallPromptEvent =>
    'prompt' in event && 'userChoice' in event

// A dismissal counts for 72 hours. A value that is not a past time (an old flag, a corrupt value,
// a clock that moved back) counts as stale, and a stale one is removed.
const readDismissed = () => {
    try {
        const dismissedAt = Number(window.localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY))
        const age = Date.now() - dismissedAt
        if (
            Number.isFinite(dismissedAt) &&
            dismissedAt > 0 &&
            age >= 0 &&
            age < INSTALL_PROMPT_DISMISS_TTL_MS
        )
            return true
        window.localStorage.removeItem(INSTALL_PROMPT_DISMISSED_KEY)
        return false
    } catch {
        // Storage can be blocked (private mode): then the choice just is not remembered.
        return false
    }
}

const writeDismissed = () => {
    try {
        window.localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, String(Date.now()))
    } catch {
        // Not remembered; the sheet closes for this visit anyway.
    }
}

const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && navigator.standalone === true)

// iPadOS reports a desktop Safari user agent, so it is told apart by its touch screen.
const isIosSafari = () =>
    /iphone|ipad|ipod/iu.test(navigator.userAgent) ||
    (/macintosh/iu.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

// Decides whether to offer installing the app: never when it already runs installed or it was
// dismissed in the last 72 hours, and only after `delayMs`. A dismissal is saved in localStorage
// with its time.
export function useInstallPrompt(delayMs = INSTALL_PROMPT_DELAY_MS): InstallPromptState {
    const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null)
    const [ios, setIos] = useState(false)
    const [blocked, setBlocked] = useState(true)
    const [ready, setReady] = useState(false)

    useEffect(() => {
        const onPrompt = (event: Event) => {
            if (!isInstallPromptEvent(event)) return
            // Keeps the browser's own mini bar away; our sheet is the offer.
            event.preventDefault()
            setDeferred(event)
        }
        const onInstalled = () => {
            setDeferred(null)
            setBlocked(true)
        }
        window.addEventListener('beforeinstallprompt', onPrompt)
        window.addEventListener('appinstalled', onInstalled)
        // The browser-only facts are read when the pause ends, so the first render matches the
        // server and nothing flashes.
        const timer = window.setTimeout(() => {
            setBlocked(isStandalone() || readDismissed())
            setIos(isIosSafari())
            setReady(true)
        }, delayMs)

        return () => {
            window.removeEventListener('beforeinstallprompt', onPrompt)
            window.removeEventListener('appinstalled', onInstalled)
            window.clearTimeout(timer)
        }
    }, [delayMs])

    const dismiss = useCallback(() => {
        writeDismissed()
        setBlocked(true)
    }, [])

    const install = useCallback(async () => {
        if (deferred === null) return
        await deferred.prompt()
        const { outcome } = await deferred.userChoice
        // The event can be used once. Declining counts as "not now, and do not ask again".
        setDeferred(null)
        if (outcome === 'dismissed') dismiss()
    }, [deferred, dismiss])

    if (blocked || !ready) return { kind: 'hidden' }
    if (deferred !== null) return { kind: 'native', install, dismiss }
    if (ios) return { kind: 'ios', dismiss }
    return { kind: 'hidden' }
}
