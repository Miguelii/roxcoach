'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconSparkles, type Icon } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

type MobileNavItem = {
    href: string
    label: string
    Icon: Icon
}

type Props = {
    items: MobileNavItem[]
    isActive: (href: string) => boolean
    onCoach: () => void
}

type LinkProps = {
    item: MobileNavItem
    active: boolean
    current: boolean
    onSelect: () => void
}

type DragState = {
    startX: number
    originX: number
    pointerId: number
    moved: boolean
}

const SLOT_COUNT = 5
const COACH_SLOT = 2
const DRAG_THRESHOLD_PX = 6

// Items sit around the centered coach button, so items from index 2 on skip its slot.
const slotOf = (index: number) => (index < COACH_SLOT ? index : index + 1)

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export function MobileNav({ items, isActive, onCoach }: Props) {
    const router = useRouter()
    const trackRef = useRef<HTMLDivElement>(null)
    const drag = useRef<DragState | null>(null)
    const suppressClick = useRef(false)
    const [dragX, setDragX] = useState<number | null>(null)
    const [pending, setPending] = useState<{ href: string; from: number } | null>(null)

    const activeIndex = items.findIndex((item) => isActive(item.href))
    // A pending target only holds while the route it was set from is still the active one.
    const pendingIndex =
        pending && pending.from === activeIndex
            ? items.findIndex((item) => item.href === pending.href)
            : -1
    const currentIndex = pendingIndex >= 0 ? pendingIndex : activeIndex
    const dragging = dragX !== null
    const [slotWidth, setSlotWidth] = useState(0)

    // Nearest route slot to a bubble offset (the coach slot is an action, never a destination).
    const nearestItemIndex = (x: number) => {
        const width = slotWidth
        if (width === 0) return Math.max(currentIndex, 0)
        const slot = clamp(Math.round(x / width), 0, SLOT_COUNT - 1)
        const index = slot < COACH_SLOT ? slot : slot - 1
        if (slot !== COACH_SLOT) return index
        return x / width < COACH_SLOT ? COACH_SLOT - 1 : COACH_SLOT
    }

    const previewIndex = dragging ? nearestItemIndex(dragX) : currentIndex

    const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (currentIndex < 0) return
        const measured = (trackRef.current?.clientWidth ?? 0) / SLOT_COUNT
        setSlotWidth(measured)
        drag.current = {
            startX: event.clientX,
            originX: slotOf(currentIndex) * measured,
            pointerId: event.pointerId,
            moved: false,
        }
    }

    const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const state = drag.current
        if (!state || state.pointerId !== event.pointerId) return
        const delta = event.clientX - state.startX
        if (!state.moved) {
            if (Math.abs(delta) < DRAG_THRESHOLD_PX) return
            state.moved = true
            event.currentTarget.setPointerCapture(event.pointerId)
        }
        setDragX(clamp(state.originX + delta, 0, (SLOT_COUNT - 1) * slotWidth))
    }

    const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
        const state = drag.current
        drag.current = null
        if (!state || !state.moved || dragX === null) return
        suppressClick.current = true
        const target = items[nearestItemIndex(dragX)]
        setDragX(null)
        if (!target || isActive(target.href)) return
        setPending({ href: target.href, from: activeIndex })
        router.push(target.href)
        if (event.type === 'pointercancel') suppressClick.current = false
    }

    const onClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!suppressClick.current) return
        suppressClick.current = false
        event.preventDefault()
        event.stopPropagation()
    }

    const bubbleTransform =
        dragX !== null
            ? `translate3d(${dragX}px,0,0) scale(1.14, 1.08)`
            : `translate3d(${slotOf(Math.max(previewIndex, 0)) * 100}%,0,0)`

    return (
        <nav
            aria-label="Primary"
            data-testid="nav-mobile"
            className={cn(
                'fixed inset-x-4 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-40 md:hidden',
                'rounded-full p-1.5',
                // Liquid glass: blurred, saturated backdrop with a bright rim and a soft shadow.
                'border border-white/60 bg-paper/55 shadow-[0_8px_32px_rgba(23,24,28,0.14),inset_0_1px_0_rgba(255,255,255,0.7)]',
                'backdrop-blur-2xl backdrop-saturate-150',
                // Solid fallback for users who asked for less transparency.
                '[@media(prefers-reduced-transparency:reduce)]:bg-paper [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none'
            )}
        >
            <div
                ref={trackRef}
                data-testid="nav-mobile-track"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                onPointerCancel={onPointerEnd}
                onClickCapture={onClickCapture}
                className="relative grid touch-pan-y grid-cols-5 items-center select-none"
            >
                {currentIndex >= 0 || dragging ? (
                    <span
                        aria-hidden="true"
                        data-testid="nav-mobile-bubble"
                        style={{ transform: bubbleTransform }}
                        className={cn(
                            'pointer-events-none absolute inset-y-0 left-0 w-1/5 rounded-full',
                            // Glass bead: translucent body, bright top rim, soft inner shade.
                            'bg-white/45 shadow-[0_4px_14px_rgba(23,24,28,0.16),inset_0_1.5px_0_rgba(255,255,255,0.95),inset_0_-6px_12px_rgba(23,24,28,0.08)]',
                            'ring-1 ring-white/70 backdrop-blur-sm',
                            dragging
                                ? 'bg-white/60 transition-none'
                                : 'transition-transform duration-500 ease-[cubic-bezier(0.34,1.45,0.5,1)] motion-reduce:transition-none'
                        )}
                    />
                ) : null}
                {items.slice(0, COACH_SLOT).map((item, index) => (
                    <MobileNavLink
                        key={item.href}
                        item={item}
                        active={index === previewIndex}
                        current={isActive(item.href)}
                        onSelect={() => setPending({ href: item.href, from: activeIndex })}
                    />
                ))}
                <button
                    type="button"
                    data-testid="nav-coach"
                    aria-label="Open coach chat"
                    onClick={onCoach}
                    className="relative mx-auto flex size-12 items-center justify-center rounded-full bg-ink text-primary-foreground shadow-md transition-transform active:scale-95 motion-reduce:transition-none"
                >
                    <IconSparkles className="size-6" />
                </button>
                {items.slice(COACH_SLOT).map((item, index) => (
                    <MobileNavLink
                        key={item.href}
                        item={item}
                        active={index + COACH_SLOT === previewIndex}
                        current={isActive(item.href)}
                        onSelect={() => setPending({ href: item.href, from: activeIndex })}
                    />
                ))}
            </div>
        </nav>
    )
}

function MobileNavLink({ item: { href, label, Icon }, active, current, onSelect }: LinkProps) {
    return (
        <Link
            href={href}
            draggable={false}
            onClick={onSelect}
            aria-current={current ? 'page' : undefined}
            className={cn(
                'relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium transition-[color,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
                active ? 'scale-105 text-ink' : 'text-muted-foreground'
            )}
        >
            <Icon className="size-5" />
            {label}
        </Link>
    )
}
