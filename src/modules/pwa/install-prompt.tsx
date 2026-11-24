'use client'

import { lazy, Suspense } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'
import { useInstallPrompt } from '@/modules/pwa/use-install-prompt'

// The sheet pulls in the drawer, so it loads only once the prompt is about to show, not with every page.
const InstallPromptView = lazy(() =>
    import('@/modules/pwa/install-prompt-view').then((module) => ({
        default: module.InstallPromptView,
    }))
)

type Props = {
    // The deployed build: a dismissal saved on another build is stale. Null when unknown (local dev).
    buildId?: string | null
    // For tests; the default is the real pause after opening the app.
    delayMs?: number
}

// Offers installing the app from a bottom sheet, on a phone only and until it is dismissed (for
// 72 hours, or until a new build).
export function InstallPrompt({ buildId = null, delayMs }: Props) {
    const isMobile = useIsMobile()
    const prompt = useInstallPrompt(buildId, delayMs)

    if (!isMobile || prompt.kind === 'hidden') return null

    return (
        <Suspense fallback={null}>
            <InstallPromptView
                variant={prompt.kind}
                onInstall={() => {
                    if (prompt.kind === 'native') void prompt.install()
                }}
                onDismiss={prompt.dismiss}
            />
        </Suspense>
    )
}
