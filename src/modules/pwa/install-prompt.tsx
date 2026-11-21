'use client'

import { useIsMobile } from '@/hooks/use-mobile'
import { InstallPromptView } from '@/modules/pwa/install-prompt-view'
import { useInstallPrompt } from '@/modules/pwa/use-install-prompt'

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
        <InstallPromptView
            variant={prompt.kind}
            onInstall={() => {
                if (prompt.kind === 'native') void prompt.install()
            }}
            onDismiss={prompt.dismiss}
        />
    )
}
