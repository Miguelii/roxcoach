'use client'

import { createContext, useContext, useMemo, useState } from 'react'
import { COACH_ENABLED_COOKIE, COACH_ENABLED_COOKIE_MAX_AGE } from '@/modules/coach/constants'

type CoachPanelState = {
    open: boolean
    setOpen: (open: boolean) => void
    // Desktop only: whether the launcher bar is shown. The mobile nav button always works.
    enabled: boolean
    setEnabled: (enabled: boolean) => void
}

type Props = {
    children: React.ReactNode
    initialEnabled?: boolean
}

// Without a provider (isolated tests) the panel is closed, enabled, and setters are no-ops.
const CoachPanelContext = createContext<CoachPanelState>({
    open: false,
    setOpen: () => {},
    enabled: true,
    setEnabled: () => {},
})

// Shares the coach panel state between the nav, the sidebar toggle and the chat island.
export function CoachPanelProvider({ children, initialEnabled = true }: Props) {
    const [open, setOpen] = useState(false)
    const [enabled, setEnabledState] = useState(initialEnabled)

    const value = useMemo(
        () => ({
            open,
            setOpen,
            enabled,
            setEnabled: (next: boolean) => {
                setEnabledState(next)
                document.cookie = `${COACH_ENABLED_COOKIE}=${next ? '1' : '0'}; path=/; max-age=${COACH_ENABLED_COOKIE_MAX_AGE}; samesite=lax`
            },
        }),
        [open, enabled]
    )
    return <CoachPanelContext.Provider value={value}>{children}</CoachPanelContext.Provider>
}

export function useCoachPanel() {
    return useContext(CoachPanelContext)
}
