import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { InstallPrompt } from '@/modules/pwa/install-prompt'
import {
    INSTALL_PROMPT_DISMISS_TTL_MS,
    INSTALL_PROMPT_DISMISSED_KEY,
} from '@/modules/pwa/constants'

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

// What was saved when the sheet was dismissed, null when nothing is saved.
const saved = (): { at: number; build: string | null } | null =>
    JSON.parse(window.localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY) ?? 'null')

// The time saved when the sheet was dismissed, 0 when nothing is saved.
const savedAt = () => saved()?.at ?? 0

const saveDismissal = (at: number, build: string | null = null) =>
    window.localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, JSON.stringify({ at, build }))

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126.0 Mobile Safari/537.36'
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1'

// The browser's install event, with a prompt that answers `outcome`.
const fireInstallEvent = (outcome: 'accepted' | 'dismissed' = 'accepted') => {
    const prompt = vi.fn().mockResolvedValue(null)
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

        await waitFor(() => expect(savedAt()).toBeCloseTo(Date.now(), -3))
        await waitFor(() => expect(screen.queryByTestId('install-prompt')).toBeNull())
    })

    it('closes with Not now, saves the choice, and does not come back on the next visit', async () => {
        const first = render(<InstallPrompt delayMs={0} />)
        fireInstallEvent()
        fireEvent.click(await screen.findByTestId('install-prompt-dismiss'))

        expect(savedAt()).toBeCloseTo(Date.now(), -3)
        await waitFor(() => expect(screen.queryByTestId('install-prompt')).toBeNull())
        first.unmount()

        render(<InstallPrompt delayMs={0} />)
        fireInstallEvent()
        await act(async () => {
            await new Promise((resolve) => {
                setTimeout(resolve, 20)
            })
        })
        expect(screen.queryByTestId('install-prompt')).toBeNull()
    })

    it.each([
        ['71 hours ago', INSTALL_PROMPT_DISMISS_TTL_MS - 60 * 60 * 1000, false],
        ['73 hours ago', INSTALL_PROMPT_DISMISS_TTL_MS + 60 * 60 * 1000, true],
    ])('a dismissal from %s %s the sheet', async (_label, ageMs, shows) => {
        saveDismissal(Date.now() - ageMs)
        render(<InstallPrompt delayMs={0} />)
        fireInstallEvent()
        await act(async () => {
            await new Promise((resolve) => {
                setTimeout(resolve, 30)
            })
        })

        expect(screen.queryByTestId('install-prompt') !== null).toBe(shows)
    })

    it.each([
        ['an old flag', '1'],
        ['an old bare time', String(Date.now())],
        ['a corrupt value', 'soon'],
        ['a time in the future', JSON.stringify({ at: Date.now() + 86_400_000, build: null })],
        ['a value without a build', JSON.stringify({ at: Date.now() })],
    ])('treats %s as stale, shows the sheet and removes the value', async (_label, value) => {
        window.localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, value)
        render(<InstallPrompt delayMs={0} />)
        fireInstallEvent()

        expect(await screen.findByTestId('install-prompt')).toBeInTheDocument()
        expect(window.localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY)).toBeNull()
    })

    it('saves the build the sheet was dismissed on', async () => {
        render(<InstallPrompt buildId="build-a" delayMs={0} />)
        fireInstallEvent()
        fireEvent.click(await screen.findByTestId('install-prompt-dismiss'))

        expect(saved()?.build).toBe('build-a')
    })

    it('stays hidden after a recent dismissal on the same build', async () => {
        saveDismissal(Date.now() - 60_000, 'build-a')
        render(<InstallPrompt buildId="build-a" delayMs={0} />)
        fireInstallEvent()
        await act(async () => {
            await new Promise((resolve) => {
                setTimeout(resolve, 30)
            })
        })

        expect(screen.queryByTestId('install-prompt')).toBeNull()
    })

    it('shows the sheet again on a new build and removes the old dismissal', async () => {
        saveDismissal(Date.now() - 60_000, 'build-a')
        render(<InstallPrompt buildId="build-b" delayMs={0} />)
        fireInstallEvent()

        expect(await screen.findByTestId('install-prompt')).toBeInTheDocument()
        expect(window.localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY)).toBeNull()
    })

    it('stays hidden when the app already runs installed', async () => {
        setMatchMedia(true)
        render(<InstallPrompt delayMs={0} />)
        fireInstallEvent()
        await act(async () => {
            await new Promise((resolve) => {
                setTimeout(resolve, 20)
            })
        })

        expect(screen.queryByTestId('install-prompt')).toBeNull()
    })

    it('stays hidden on a wide screen', async () => {
        mocks.isMobile = false
        render(<InstallPrompt delayMs={0} />)
        fireInstallEvent()
        await act(async () => {
            await new Promise((resolve) => {
                setTimeout(resolve, 20)
            })
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
        expect(savedAt()).toBeCloseTo(Date.now(), -3)
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
