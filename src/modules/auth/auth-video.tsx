'use client'

import { useEffect, useRef, useState } from 'react'
import { IconPlayerPauseFilled, IconPlayerPlayFilled } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'

// Must match the `lg:` breakpoint the auth layout uses to show the video panel.
const PANEL_VISIBLE_QUERY = '(min-width: 1024px)'

// The video only plays while its panel is on screen and motion is allowed, so a phone (panel
// hidden) never downloads it. A refused play (low power mode) just leaves the poster.
export function AuthVideo() {
    const videoRef = useRef<HTMLVideoElement>(null)
    const reducedMotion = usePrefersReducedMotion()
    const [paused, setPaused] = useState(true)

    useEffect(() => {
        const video = videoRef.current
        if (!video) return
        const panelVisible = window.matchMedia(PANEL_VISIBLE_QUERY)
        const sync = () => {
            if (panelVisible.matches && !reducedMotion) {
                video.play().catch(() => {})
            } else {
                video.pause()
            }
        }
        sync()
        panelVisible.addEventListener('change', sync)
        return () => panelVisible.removeEventListener('change', sync)
    }, [reducedMotion])

    const toggle = () => {
        const video = videoRef.current
        if (!video) return
        if (video.paused) {
            video.play().catch(() => {})
        } else {
            video.pause()
        }
    }

    return (
        <div className="relative size-full">
            <video
                ref={videoRef}
                data-testid="auth-video"
                src="/assets/brag.mp4"
                poster="/assets/brag.jpg"
                muted
                loop
                playsInline
                preload="none"
                aria-hidden
                onPlay={() => setPaused(false)}
                onPause={() => setPaused(true)}
                className="size-full object-contain"
            />
            <Button
                data-testid="auth-video-toggle"
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label={paused ? 'Play video' : 'Pause video'}
                onClick={toggle}
                className="absolute bottom-6 left-6"
            >
                {paused ? <IconPlayerPlayFilled /> : <IconPlayerPauseFilled />}
            </Button>
        </div>
    )
}
