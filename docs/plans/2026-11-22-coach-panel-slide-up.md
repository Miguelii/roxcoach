# Coach panel slide-up animation

- **Status**: DONE
- **Commit**: 2c82ed1
- **Severity**: MEDIUM
- **Category**: Missed opportunity (with interruptibility and accessibility constraints)
- **Estimated scope**: 1 component file, 1 test file, 1 spec paragraph (about 60 changed lines)
- **Spec**: `docs/tech-specs/coach-chat.md` (panel paragraph near line 299)

## Problem

The coach panel appears and disappears with no motion. Clicking the desktop coach bar
(`coach-launcher`) or the mobile nav coach button swaps the bar for a full panel in one frame, and
closing it (Escape, the close button, a scrim click) removes it in one frame. The athlete loses track
of where the panel came from, and the swap feels abrupt next to the rest of the app, which already
uses spring curves on its bars and buttons.

The cause is in `src/modules/coach/coach-chat-view.tsx`.

**1. The panel only exists while `open` is true, so it can never animate out** (`coach-chat-view.tsx:74-110`, current):

```tsx
if (!open) {
    if (!launcherEnabled) return null
    // On mobile the coach opens from the bottom nav, so the bar only shows from md up.
    return <div className="fixed bottom-4 left-1/2 z-30 hidden ... md:block">...launcher...</div>
}

return (
    <CoachPanelFrame onOpenChange={onOpenChange}>
        <PanelBody {...props} errorKind={errorKind} status={status} />
    </CoachPanelFrame>
)
```

**2. The frame and the panel have no transition at all** (`coach-chat-view.tsx:117-146`, current):

```tsx
function CoachPanelFrame({ onOpenChange, children }: FrameProps) {
    const viewport = useVisualViewport()
    useLockPageScroll()

    return (
        <div
            data-testid="coach-scrim"
            className="fixed inset-0 z-50 md:flex md:items-center md:justify-center md:bg-ink/30 md:p-6"
            style={
                viewport === null
                    ? undefined
                    : { top: viewport.offsetTop, height: viewport.height, bottom: 'auto' }
            }
            onClick={(event) => {
                if (event.target === event.currentTarget) onOpenChange(false)
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Coach chat"
                data-testid="coach-panel"
                className={cn(
                    'flex h-full w-full flex-col bg-paper text-ink',
                    'md:h-[42rem] md:max-h-full md:max-w-[46rem]',
                    'md:rounded-[var(--radius-surface)] md:border md:border-hairline md:shadow-[0_30px_80px_-30px_color-mix(in_srgb,var(--color-ink)_50%,transparent)]'
                )}
            >
                {children}
            </div>
        </div>
    )
}
```

## Target

The panel slides up into place when it opens and slides back down when it closes. It uses CSS
**transitions** (not keyframes), so closing halfway through the opening reverses smoothly from where
the panel is instead of jumping.

|             | Phone (below `md`)                                  | Desktop (`md` and up)                                                        |
| ----------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| Panel enter | `translate-y-full` to `0`, **500ms**, `ease-spring` | `translate-y-10` (2.5rem) plus `opacity-0` to rest, **400ms**, `ease-spring` |
| Panel exit  | `0` to `translate-y-full`, **300ms**, `ease-spring` | rest to `translate-y-10` plus `opacity-0`, **250ms**, `ease-spring`          |
| Backdrop    | none (the panel is full screen)                     | `opacity-0` to `opacity-100`, same duration as the panel, `ease-out-strong`  |

- **Curves**: `ease-spring` is `cubic-bezier(0.32, 0.72, 0, 1)`, the iOS drawer curve (`--ease-spring`, `src/styles/theme.css:70` and `:156`). `ease-out-strong` is `cubic-bezier(0.16, 1, 0.3, 1)` (`src/styles/theme.css:157`). Both already exist as Tailwind utilities, so add no new token.
- **Exit is faster than enter** (about 60%), so dismissing feels responsive.
- **Properties**: only `translate` and `opacity` (the backdrop uses `opacity` on its own layer, never an animated `background-color`).
- **Entry**: uses `@starting-style` through Tailwind v4's `starting:` variant. A browser without it (Safari before 17.5) shows the panel with no entry motion, which is acceptable.
- **During the exit**:
    - the panel stays mounted with `data-state="closed"` and is `inert`;
    - the scrim is `pointer-events-none`, so the page and the coach bar are clickable at once;
    - the coach bar renders under it (z-30 under z-50), so the panel visibly slides back toward the bar.
- **Unmount**: the panel unmounts on its own `transitionend`. A 600ms fallback timer also unmounts it, in case no transition fires.
- **Reduced motion**: keep the repo's global rule (`src/styles/globals.css:197-205` sets every transition to 0.001ms). Movement then becomes instant and `transitionend` still fires. Do not add a per-component override.

## Repo conventions to follow

- **Exemplar of the spring curve and press feedback:** `src/components/ui/button.tsx`, which uses `ease-spring` as a Tailwind class.
- **Exemplar of state adjusted during render (no effect):** `PanelBody` in the same file uses `const [previousStatus, setPreviousStatus] = useState(status)` and then `if (previousStatus !== status) { setPreviousStatus(status); ... }`. Use that pattern for `rendered`.
- **Classes and markup:**
    - merge classes with `cn()` from `@/lib/utils`;
    - use semantic tokens only (`bg-ink/30`, `bg-paper`);
    - types go at the top of the file;
    - no comments that restate code;
    - no em-dashes anywhere.
- **Tests:**
    - locate elements by `data-testid` only;
    - run them with `pnpm test`, never vitest directly;
    - jsdom never fires `transitionend` by itself, so tests fire it with `fireEvent.transitionEnd`.

## Steps

1. **Add the `rendered` state** in `CoachChatView` (`coach-chat-view.tsx`, just after the props destructuring). Adjust it during render so it turns on as soon as `open` turns on:

    ```tsx
    const [rendered, setRendered] = useState(open)
    if (open && !rendered) setRendered(true)
    ```

    Then add the fallback effect after the existing Escape effect:

    ```tsx
    useEffect(() => {
        if (open || !rendered) return
        const timer = setTimeout(() => setRendered(false), EXIT_FALLBACK_MS)
        return () => clearTimeout(timer)
    }, [open, rendered])
    ```

    Declare `const EXIT_FALLBACK_MS = 600` next to the other module constants (near `STICK_PX`). Keep the comment for it to one line saying it is the safety net when no transition fires.

2. **Render the coach bar and the panel together.** Replace the `if (!open) { ... return launcher }` / `return <CoachPanelFrame>` split (`coach-chat-view.tsx:74-110`) with one return:
    - Extract the bar markup as it is into a local `launcher` element (or a small `CoachLauncher` component in the same file, with a named `Props` type at the top of the file). It renders when `!open && launcherEnabled`.
    - The panel renders when `rendered`, as `<CoachPanelFrame open={open} onOpenChange={onOpenChange} onExited={() => setRendered(false)}>`.
    - Return `<>{launcher}{panel}</>`. When neither shows, return `null`.

3. **Give `CoachPanelFrame` the new props.** Add `open: boolean` and `onExited: () => void` to `FrameProps` at the top of the file.
    - On the scrim `div`:
        - add `data-state={open ? 'open' : 'closed'}`;
        - remove `md:bg-ink/30`;
        - add `data-[state=closed]:pointer-events-none` through `cn()`.
    - Keep `data-testid="coach-scrim"`, the `md:flex md:items-center md:justify-center md:p-6` classes and the click handler unchanged (a test asserts those classes).

4. **Add the desktop backdrop** as the first child of the scrim, before the panel:

    ```tsx
    <div
        aria-hidden="true"
        data-state={open ? 'open' : 'closed'}
        className={cn(
            'pointer-events-none absolute inset-0 hidden bg-ink/30 md:block',
            'transition-opacity duration-400 ease-out-strong starting:opacity-0',
            'data-[state=closed]:opacity-0 data-[state=closed]:duration-250'
        )}
    />
    ```

    `pointer-events-none` matters: a click on the backdrop must reach the scrim, whose handler checks `event.target === event.currentTarget`.

5. **Animate the panel.** On the `role="dialog"` div:
    - Add `data-state={open ? 'open' : 'closed'}` and `inert={!open}`.
    - Add these classes through `cn()`, keeping every existing class:

    ```tsx
    'relative',
    'transition-[translate,opacity] duration-500 ease-spring md:duration-400',
    'starting:translate-y-full md:starting:translate-y-10 md:starting:opacity-0',
    'data-[state=closed]:translate-y-full data-[state=closed]:duration-300',
    'md:data-[state=closed]:translate-y-10 md:data-[state=closed]:opacity-0 md:data-[state=closed]:duration-250',
    ```

    Then add the handler:

    ```tsx
    onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && !open) onExited()
    }}
    ```

    The target check ignores transitions that bubble up from buttons and chips inside the panel.

6. **Check the compiled CSS before moving on.**
    - In DevTools, select `coach-panel` while it is open and confirm `transition-property: translate, opacity` and `transition-timing-function: cubic-bezier(0.32, 0.72, 0, 1)`.
    - Close it and confirm the computed `transition-duration` is 300ms below `md` and 250ms from `md`.
    - If a `md:` duration wins over a `data-[state=closed]:` duration in the wrong order, use the arbitrary variant `md:data-[state=closed]:duration-250` as written above (it must outrank `md:duration-400`). If it still loses, STOP and report.

7. **Add the tests** in `src/modules/coach/__tests__/coach-chat-view.test.tsx`, inside the existing top-level `describe`, using the existing `Harness`:

    ```tsx
    it('keeps the panel mounted while it slides out, then removes it', () => {
        render(<Harness />)
        fireEvent.click(screen.getByTestId('coach-close'))

        const panel = screen.getByTestId('coach-panel')
        expect(panel).toHaveAttribute('data-state', 'closed')
        expect(screen.getByTestId('coach-scrim')).toHaveClass(
            'data-[state=closed]:pointer-events-none'
        )
        expect(screen.getByTestId('coach-launcher')).toBeInTheDocument()

        fireEvent.transitionEnd(panel)
        expect(screen.queryByTestId('coach-panel')).not.toBeInTheDocument()
    })

    it('reopens from the middle of the slide out without remounting', () => {
        render(<Harness />)
        fireEvent.click(screen.getByTestId('coach-close'))
        fireEvent.click(screen.getByTestId('coach-launcher'))

        expect(screen.getByTestId('coach-panel')).toHaveAttribute('data-state', 'open')
    })
    ```

    Add a third test with `vi.useFakeTimers()`: close, call `vi.advanceTimersByTime(600)`, then assert `coach-panel` is gone. Restore with `vi.useRealTimers()`. Every existing test in the file must keep passing unchanged. If one fails, the step is wrong: STOP and report instead of editing the test.

8. **Update the spec.** In `docs/tech-specs/coach-chat.md` (the panel paragraph near line 299), add one sentence:

    > The panel slides up when it opens (from the bottom edge on a phone, 2.5rem with a fade on desktop) and slides back down when it closes, with CSS transitions on `ease-spring`, so closing mid-way reverses smoothly.

## Boundaries

- Do NOT touch `PanelBody`, `useLockPageScroll`, `useVisualViewport`, the composer, the history menu or the coach bar markup. Only move the bar into the new single return.
- Do NOT add dependencies (no Framer Motion), keyframes or `tw-animate-css` `animate-in` classes. Transitions only.
- Do NOT use base-ui `Dialog` or `Drawer` primitives. The panel is deliberately custom because of the visual viewport handling.
- Do NOT change the global reduced-motion rule in `src/styles/globals.css`.
- If the code at the cited lines no longer matches (drift since commit `2c82ed1`), STOP and report.

## Verification

- **Mechanical**: run `pnpm fmt`, `pnpm check`, `pnpm knip` and `pnpm test`. All must pass, including the three new tests.
- **Feel check** (run the app, signed in):
    - **Desktop:** click the coach bar. The panel rises about 2.5rem while it fades in, and the backdrop darkens in step. Nothing pops.
    - **Phone width (375px):** tap the centre coach button in the bottom nav. The panel slides up from the bottom edge like an iOS sheet and settles without a bounce.
    - **Closing:** use Escape, the close button and a scrim click. The panel goes back down noticeably faster than it came up, and the coach bar is already there beneath it.
    - **Interrupting:** click the bar and press Escape about 150ms later. The panel reverses from where it is, without jumping back to the start.
    - **Clicks during the exit:** while the panel slides out, click a link on the page. It responds (the scrim no longer blocks clicks).
    - **Slow motion:** set the Animations panel in DevTools to 10% and confirm only `translate` and `opacity` animate. No layout or paint flashes should show with Rendering, Paint flashing on.
    - **Reduced motion:** turn on `prefers-reduced-motion` in the Rendering panel. Opening and closing become instant, and the panel still unmounts after closing.
- **Done when**:
    - both breakpoints show the slide in and out above;
    - reopening mid-exit reverses smoothly;
    - the panel is gone from the DOM after closing;
    - all checks are green.
