'use client'

import { useIsMobile } from '@/hooks/use-mobile'
import { InstallPromptView } from '@/modules/pwa/install-prompt-view'
import { useInstallPrompt } from '@/modules/pwa/use-install-prompt'

type Props = {
    // For tests; the default is the real pause after opening the app.
    delayMs?: number
}

// Offers installing the app from a bottom sheet, on a phone only and until it is dismissed.
export function InstallPrompt({ delayMs }: Props) {
    const isMobile = useIsMobile()
    const prompt = useInstallPrompt(delayMs)

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
