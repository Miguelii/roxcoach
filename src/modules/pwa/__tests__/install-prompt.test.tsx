import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { InstallPrompt } from '@/modules/pwa/install-prompt'
import { INSTALL_PROMPT_DISMISSED_KEY } from '@/modules/pwa/constants'

const mocks = vi.hoisted(() => ({ isMobile: true }))

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mocks.isMobile }))

const setMatchMedia = (standalone: boolean) =>
    vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({
            matches: standalone && query.includes('standalone'),
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }))
    )

const setUserAgent = (userAgent: string) =>
    Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, configurable: true })

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126.0 Mobile Safari/537.36'
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1'

// The browser's install event, with a prompt that answers `outcome`.
const fireInstallEvent = (outcome: 'accepted' | 'dismissed' = 'accepted') => {
    const prompt = vi.fn().mockResolvedValue(undefined)
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt,
        userChoice: Promise.resolve({ outcome }),
    })
    act(() => {
        window.dispatchEvent(event)
    })
    return { prompt, event }
}

describe('InstallPrompt', () => {
    beforeEach(() => {
        mocks.isMobile = true
        window.localStorage.clear()
        setMatchMedia(false)
        setUserAgent(ANDROID_UA)
    })

    afterEach(() => {
        cleanup()
        vi.unstubAllGlobals()
    })

    it('offers the install button on a phone once the browser says the app can be installed', async () => {
        render(<InstallPrompt delayMs={0} />)
        const { event } = fireInstallEvent()

        expect(await screen.findByTestId('install-prompt')).toBeInTheDocument()
        expect(screen.getByTestId('install-prompt-install')).toHaveTextContent('Install app')
        expect(screen.getByTestId('install-prompt-dismiss')).toHaveTextContent('Not now')
        expect(event.defaultPrevented).toBe(true)
    })

    it('installs with the browser prompt when the button is clicked', async () => {
        render(<InstallPrompt delayMs={0} />)
        const { prompt } = fireInstallEvent('accepted')

        fireEvent.click(await screen.findByTestId('install-prompt-install'))

        await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1))
        expect(window.localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY)).toBeNull()
    })

    it('remembers a declined browser prompt as dismissed', async () => {
        render(<InstallPrompt delayMs={0} />)
        fireInstallEvent('dismissed')

        fireEvent.click(await screen.findByTestId('install-prompt-install'))

        await waitFor(() =>
            expect(window.localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY)).toBe('1')
        )
        await waitFor(() => expect(screen.queryByTestId('install-prompt')).toBeNull())
    })

    it('closes with Not now, saves the choice, and does not come back on the next visit', async () => {
        const first = render(<InstallPrompt delayMs={0} />)
        fireInstallEvent()
        fireEvent.click(await screen.findByTestId('install-prompt-dismiss'))

        expect(window.localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY)).toBe('1')
        await waitFor(() => expect(screen.queryByTestId('install-prompt')).toBeNull())
        first.unmount()

        render(<InstallPrompt delayMs={0} />)
        fireInstallEvent()
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20))
        })
        expect(screen.queryByTestId('install-prompt')).toBeNull()
    })

    it('stays hidden when the app already runs installed', async () => {
        setMatchMedia(true)
        render(<InstallPrompt delayMs={0} />)
        fireInstallEvent()
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20))
        })

        expect(screen.queryByTestId('install-prompt')).toBeNull()
    })

    it('stays hidden on a wide screen', async () => {
        mocks.isMobile = false
        render(<InstallPrompt delayMs={0} />)
        fireInstallEvent()
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20))
        })

        expect(screen.queryByTestId('install-prompt')).toBeNull()
    })

    it('waits for the pause before showing the sheet', async () => {
        render(<InstallPrompt delayMs={80} />)
        fireInstallEvent()

        expect(screen.queryByTestId('install-prompt')).toBeNull()
        expect(await screen.findByTestId('install-prompt')).toBeInTheDocument()
    })

    it('closes when the app gets installed', async () => {
        render(<InstallPrompt delayMs={0} />)
        fireInstallEvent()
        await screen.findByTestId('install-prompt')

        act(() => {
            window.dispatchEvent(new Event('appinstalled'))
        })

        await waitFor(() => expect(screen.queryByTestId('install-prompt')).toBeNull())
    })

    it('explains the Share menu steps on iOS Safari, with no install button', async () => {
        setUserAgent(IPHONE_UA)
        render(<InstallPrompt delayMs={0} />)

        expect(await screen.findByTestId('install-prompt-steps')).toHaveTextContent(
            'Add to Home Screen'
        )
        expect(screen.queryByTestId('install-prompt-install')).toBeNull()
        expect(screen.getByTestId('install-prompt-dismiss')).toHaveTextContent('Got it')
        fireEvent.click(screen.getByTestId('install-prompt-dismiss'))
        expect(window.localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY)).toBe('1')
    })

    it('still works when storage is blocked, it just does not remember the choice', async () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked')
        })
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('blocked')
        })
        render(<InstallPrompt delayMs={0} />)
        fireInstallEvent()

        fireEvent.click(await screen.findByTestId('install-prompt-dismiss'))
        await waitFor(() => expect(screen.queryByTestId('install-prompt')).toBeNull())
        vi.restoreAllMocks()
    })
})
