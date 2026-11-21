import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { StandaloneZoomLock } from '@/modules/pwa/standalone-zoom-lock'

const BASE_VIEWPORT = 'width=device-width, initial-scale=1, viewport-fit=cover'

const setStandalone = (standalone: boolean) =>
    vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({
            matches: standalone && query.includes('standalone'),
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }))
    )

const viewport = () =>
    document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? null

// A cancelable iOS pinch start; true when the lock blocked it.
const pinchBlocked = () => {
    const event = new Event('gesturestart', { cancelable: true })
    document.dispatchEvent(event)
    return event.defaultPrevented
}

describe('StandaloneZoomLock', () => {
    beforeEach(() => {
        const meta = document.createElement('meta')
        meta.name = 'viewport'
        meta.content = BASE_VIEWPORT
        document.head.append(meta)
    })

    afterEach(() => {
        cleanup()
        vi.unstubAllGlobals()
        document.querySelector('meta[name="viewport"]')?.remove()
    })

    it('blocks zoom when the app runs installed', () => {
        setStandalone(true)
        render(<StandaloneZoomLock />)

        expect(viewport()).toBe(`${BASE_VIEWPORT}, maximum-scale=1, user-scalable=no`)
        expect(pinchBlocked()).toBe(true)
    })

    it('leaves zoom alone in a browser tab', () => {
        setStandalone(false)
        render(<StandaloneZoomLock />)

        expect(viewport()).toBe(BASE_VIEWPORT)
        expect(pinchBlocked()).toBe(false)
    })

    it('restores the viewport and stops blocking when unmounted', () => {
        setStandalone(true)
        const { unmount } = render(<StandaloneZoomLock />)
        unmount()

        expect(viewport()).toBe(BASE_VIEWPORT)
        expect(pinchBlocked()).toBe(false)
    })
})
