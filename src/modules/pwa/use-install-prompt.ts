'use client'

import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import {
    INSTALL_PROMPT_DELAY_MS,
    INSTALL_PROMPT_DISMISS_TTL_MS,
    INSTALL_PROMPT_DISMISSED_KEY,
} from '@/modules/pwa/constants'
import { isStandalone } from '@/modules/pwa/utils'

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

type Dismissal = z.output<typeof DismissalSchema>

// The saved value is JSON text; an old or corrupt value fails to parse and counts as stale.
const DismissalSchema = z
    .string()
    .transform((text, ctx) => {
        try {
            return JSON.parse(text)
        } catch {
            ctx.addIssue({ code: 'custom', message: 'Not JSON' })
            return z.NEVER
        }
    })
    .pipe(z.object({ at: z.number().int().positive(), build: z.string().nullable() }))

const isInstallPromptEvent = (event: Event): event is InstallPromptEvent =>
    'prompt' in event && 'userChoice' in event

// A dismissal counts for 72 hours and only on the build it was made on. Anything else (another
// build, the old bare time, a corrupt value, a clock that moved back) counts as stale, and a stale
// value is removed.
const isFresh = ({ at, build }: Dismissal, buildId: string | null) => {
    const age = Date.now() - at
    return age >= 0 && age < INSTALL_PROMPT_DISMISS_TTL_MS && build === buildId
}

const readDismissed = (buildId: string | null) => {
    try {
        const parsed = DismissalSchema.safeParse(
            window.localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY)
        )
        if (parsed.success && isFresh(parsed.data, buildId)) return true
        window.localStorage.removeItem(INSTALL_PROMPT_DISMISSED_KEY)
        return false
    } catch {
        // Storage can be blocked (private mode): then the choice just is not remembered.
        return false
    }
}

const writeDismissed = (buildId: string | null) => {
    try {
        window.localStorage.setItem(
            INSTALL_PROMPT_DISMISSED_KEY,
            JSON.stringify({ at: Date.now(), build: buildId })
        )
    } catch {
        // Not remembered; the sheet closes for this visit anyway.
    }
}

// iPadOS reports a desktop Safari user agent, so it is told apart by its touch screen.
const isIosSafari = () =>
    /iphone|ipad|ipod/iu.test(navigator.userAgent) ||
    (/macintosh/iu.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

// Decides whether to offer installing the app: never when it already runs installed or it was
// dismissed in the last 72 hours on this same build, and only after `delayMs`. A dismissal is
// saved in localStorage with its time and `buildId`.
export function useInstallPrompt(
    buildId: string | null,
    delayMs = INSTALL_PROMPT_DELAY_MS
): InstallPromptState {
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
            setBlocked(isStandalone() || readDismissed(buildId))
            setIos(isIosSafari())
            setReady(true)
        }, delayMs)

        return () => {
            window.removeEventListener('beforeinstallprompt', onPrompt)
            window.removeEventListener('appinstalled', onInstalled)
            window.clearTimeout(timer)
        }
    }, [buildId, delayMs])

    const dismiss = useCallback(() => {
        writeDismissed(buildId)
        setBlocked(true)
    }, [buildId])

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
