import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AuthVideo } from '@/modules/auth/auth-video'

type MediaState = { wide: boolean; reducedMotion: boolean }

const stubMedia = ({ wide, reducedMotion }: MediaState) => {
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches:
            (query === '(min-width: 1024px)' && wide) ||
            (query === '(prefers-reduced-motion: reduce)' && reducedMotion),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
    }))
}

let play: ReturnType<typeof vi.spyOn>
let pause: ReturnType<typeof vi.spyOn>

beforeEach(() => {
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => {})
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('AuthVideo', () => {
    it('plays muted and looping when its panel is visible', () => {
        stubMedia({ wide: true, reducedMotion: false })
        render(<AuthVideo />)

        const video = screen.getByTestId<HTMLVideoElement>('auth-video')
        expect(play).toHaveBeenCalled()
        expect(video.muted).toBe(true)
        expect(video.loop).toBe(true)
        expect(video).toHaveAttribute('preload', 'none')
    })

    it('stays on the poster on a narrow screen, where the panel is hidden', () => {
        stubMedia({ wide: false, reducedMotion: false })
        render(<AuthVideo />)

        expect(play).not.toHaveBeenCalled()
        expect(pause).toHaveBeenCalled()
    })

    it('does not autoplay when the user asked to reduce motion', () => {
        stubMedia({ wide: true, reducedMotion: true })
        render(<AuthVideo />)

        expect(play).not.toHaveBeenCalled()
    })

    it('lets the user start a paused video and labels the control', () => {
        stubMedia({ wide: true, reducedMotion: true })
        render(<AuthVideo />)

        const toggle = screen.getByTestId('auth-video-toggle')
        expect(toggle).toHaveAttribute('aria-label', 'Play video')
        fireEvent.click(toggle)
        expect(play).toHaveBeenCalledTimes(1)

        fireEvent.play(screen.getByTestId('auth-video'))
        expect(toggle).toHaveAttribute('aria-label', 'Pause video')
    })
})
