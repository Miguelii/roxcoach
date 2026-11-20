'use client'

import { createContext, useContext } from 'react'

export const DrawerPortalContainerContext = createContext<HTMLElement | null>(null)

export function useDrawerPortalContainer() {
    return useContext(DrawerPortalContainerContext)
}
