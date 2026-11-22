# Soft Studio Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the BrewStock design system with Soft Studio (light only, Outfit, re-tuned hues, pill buttons, soft elevation) so every existing screen picks up the new look through tokens.

**Architecture:** Values change in `src/styles/theme.css` and `tone.css`; token names stay except where meaning changed (`tangerine` becomes `signal`, new `signal-strong`, `red`, `sunken`, `ink-45`). Dead tokens and the unused dark theme are deleted. Type scale lives as component classes in `globals.css`. A file-reading unit test pins token values and WCAG contrast pairs, since jsdom does not compute CSS.

**Tech Stack:** Next.js 16 (`next/font/google`), Tailwind CSS v4 (`@theme inline`), shadcn on base-ui, `class-variance-authority`, vite-plus tests (`pnpm test`).

**Spec:** `docs/tech-specs/2026-11-21-design-system-design.md`

## Global Constraints

- Light only. No `dark:` variant, no `.dark` class, no `next-themes`.
- Every Supabase/backend file is out of scope; only `src/styles`, `src/components`, `src/modules` UI, `src/app/layout.tsx`, `src/app/manifest.ts` and docs change.
- Orange (`signal`) means only: Hyrox, the primary call to action, the logo dot, heart rate and goal lines. Bad news is `red`, caution is `amber`.
- White text never sits on `#FF5B2E`; it sits on `signal-strong` `#CC3D15`.
- Colour is never the only carrier of meaning: chips keep icon plus label, chart zones keep dash plus marker.
- No 1px grey borders on cards: hairline ring (`ring-1 ring-hairline`) plus `shadow-soft`.
- Motion curve `cubic-bezier(0.32, 0.72, 0, 1)` (`ease-spring`); respect `prefers-reduced-motion`.
- Project rules: English only, no em-dashes anywhere, `@/` imports, `cn()` for classes, semantic tokens only, tests locate by `data-testid` only.
- Do not start a dev server unless the athlete says so. Use `pnpm test`, never vitest directly.
- Every commit passes `pnpm fmt`, `pnpm check`, `pnpm knip`; run `pnpm test` before each commit.

## Review Focus

1. Classes that reference a removed token (`bg-tangerine`, `text-navy`, `bg-accent-blue`, `dark:`) silently render with no colour instead of failing the build. Expected: none left. Pinned by the `src/` grep step in Task 2, Task 3 and Task 7.
2. Text on a filled tone surface (`bg-tone text-tone-ink`) for `plum` and `green` fails AA with the base colour (4.31:1 and 3.41:1). Expected: those tones fill with `-deep`. Pinned by the contrast test in Task 1.
3. Muted text (`muted-foreground`) on `paper` must stay at or above 4.5:1 after the ground changes. Pinned by the contrast test in Task 1.
4. Buttons in drawer footers and `ConfirmDialog` grow from 40px to 48px on mobile; footers must not overflow on a 375px wide screen. Expected: buttons wrap or stretch, never clip. Pinned by the visual check in Task 7.
5. `.display` titles with long words (race names, exercise names) lose uppercase and change font; they must still truncate or wrap where they did. Pinned by the visual check in Task 7.

---

### Task 1: Soft Studio tokens

**Files:**

- Modify: `src/styles/theme.css`
- Modify: `src/styles/tone.css`
- Test: `src/styles/__tests__/theme.test.ts` (create)

**Interfaces:**

- Produces (CSS custom properties, exposed as Tailwind colours through `@theme inline` as `--color-<name>`): `paper #F5F5F3`, `card #FFFFFF`, `sunken #EBEBE8`, `ink #121214`, `ink-45 rgba(18,18,20,.45)`, `hairline rgba(18,18,20,.07)`, `hairline-strong rgba(18,18,20,.12)`; hue triplets `signal`, `blue`, `plum`, `slate`, `amber`, `green`, `red` with `-soft` and `-deep` (values in the spec table); `signal-strong #CC3D15`; `--shadow-soft`, `--shadow-lift` (Tailwind `shadow-soft`, `shadow-lift`); `--ease-spring` (Tailwind `ease-spring`); `--radius: 16px`; `--radius-surface: 28px`; `--radius-surface-inner: 22px`. Tone values `signal`, `red` added to `[data-tone]`.
- Temporary: `--tangerine`, `--tangerine-soft`, `--tangerine-deep` (aliases of the `signal` triplet) and `--accent-blue` (alias of `ink`), with their `--color-*`, stay so nothing loses colour before Task 2 removes them.

- [ ] **Step 1: Write the failing test**

`src/styles/__tests__/theme.test.ts` reads `src/styles/theme.css` and `src/styles/tone.css` with `node:fs` and parses `--name: value;` pairs from the `:root` block. Contrast helper (WCAG relative luminance; alpha colours are composited over the background first):

```ts
function luminance(hex: string) {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i + 1, i + 3), 16) / 255)
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
function contrast(a: string, b: string) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
}
```

Tests:

- `it('defines the Soft Studio neutrals')`: `paper` is `#F5F5F3`, `card` `#FFFFFF`, `sunken` `#EBEBE8`, `ink` `#121214` (case insensitive).
- `it('defines every hue triplet')`: for each of `signal blue plum slate amber green red`, `--x`, `--x-soft`, `--x-deep` exist; `--signal` is `#FF5B2E`, `--signal-strong` is `#CC3D15`, `--red` is `#D92D2D`.
- `it('keeps white text at AA on every filled surface')`: `contrast('#FFFFFF', v) >= 4.5` for `signal-strong`, `blue`, `red`, `slate`, `plum-deep`, `green-deep`.
- `it('keeps deep text at AA on soft surfaces')`: `contrast(x-deep, x-soft) >= 4.5` for all seven hues.
- `it('keeps muted text at AA on paper and card')`: `muted-foreground` composited over `paper` and over `card` gives `>= 4.5`.
- `it('fills plum and green tones with their deep shade')`: in `tone.css`, `[data-tone='plum']` sets `--tone: var(--plum-deep)` and `[data-tone='green']` sets `--tone: var(--green-deep)`; `[data-tone='signal']` sets `--tone: var(--signal-strong)`.
- `it('defines the elevation, radius and motion tokens')`: `--shadow-soft`, `--shadow-lift`, `--ease-spring: cubic-bezier(0.32, 0.72, 0, 1)`, `--radius: 16px` (or `1rem`), `--radius-surface-inner: 22px` are present.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/styles/__tests__/theme.test.ts`
Expected: FAIL (paper is `#f7f4ee`, no `signal`, no `red`).

- [ ] **Step 3: Rewrite the `:root` values and `@theme inline` block in `src/styles/theme.css`**

Values from the spec tables. Remap shadcn semantic tokens: `--background: var(--paper)`, `--foreground: var(--ink)`, `--primary: var(--ink)`, `--primary-foreground: var(--paper)`, `--secondary`, `--muted`, `--accent: var(--sunken)` with `*-foreground: var(--ink)`, `--muted-foreground: rgba(18,18,20,.6)`, `--popover: var(--card)`, `--border` and `--input: var(--hairline-strong)`, `--ring: rgba(18,18,20,.4)`, `--destructive: var(--red)`, `--positive: var(--green)`, `--warning: var(--amber-deep)`. Delete `navy`, `--sidebar-*`, `--chart-1..5`, `--accent-blue-dark`, `--accent-blue-light`, `--accent-green*`, `--primary-muted` and the `--color-*` that expose them (none is used outside the CSS). Keep `--accent-blue` as a temporary alias of `var(--ink)` because the `default` button still uses `bg-accent-blue`; Task 2 removes it. Add `--shadow-soft`, `--shadow-lift` as `--shadow-*` theme keys and `--ease-spring` next to the kept `--ease-out-strong`. In `tone.css`: rename `tangerine` to `signal` (with `--tone: var(--signal-strong)`), drop `navy`, add `red`, set `plum` and `green` fills to `-deep`, `--tone-ink` white for `signal blue plum green red slate`, `amber-deep` for `amber`; `[data-tone='paper']` soft becomes `var(--card)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/styles/__tests__/theme.test.ts`
Expected: PASS

- [ ] **Step 5: Check, then commit**

Run: `pnpm fmt && pnpm check && pnpm knip && pnpm test` (all green).

```bash
git add src/styles/theme.css src/styles/tone.css src/styles/__tests__/theme.test.ts
git commit -m "feat(design): Soft Studio colour, elevation and motion tokens"
```

### Task 2: Move orange call sites to their meaning

**Files:**

- Modify: `src/modules/calendar/kinds.ts:13,24`
- Modify: `src/modules/dashboard/progress/series-styles.ts:8-22`
- Modify: `src/modules/dashboard/progress/selectable-bar-chart.tsx:15`
- Modify: `src/modules/dashboard/progress/goal-pace-card.tsx:28`
- Modify: `src/modules/dashboard/progress/week-dots.tsx:62`
- Modify: `src/modules/dashboard/progress/strength-overview-card.tsx:168`
- Modify: `src/modules/dashboard/progress/exercise-insights.tsx:18`
- Modify: `src/modules/races/race-card-view.tsx:176`
- Modify: `src/modules/coach/coach-chat-view.tsx:87`
- Modify: `src/modules/activity/activity-view.tsx:255`
- Modify: `src/components/ui/button.tsx:13,17` (`default` becomes `bg-ink text-paper hover:bg-ink/90`; `tangerine` key renamed `signal`; the rest of the styling is Task 5)
- Modify: `src/styles/theme.css` (delete the temporary `tangerine` and `accent-blue` aliases)
- Test: `src/modules/calendar/__tests__/kinds.test.ts` (create), `src/modules/dashboard/progress/__tests__/series-styles.test.ts` (create), `src/modules/races/__tests__/race-card-view.test.tsx` (extend)

**Interfaces:**

- Consumes: `signal`, `signal-strong`, `red`, `amber`, `plum`, `blue`, `ink` from Task 1.
- Produces: `type Tone = 'blue' | 'signal' | 'plum' | 'slate'` in `kinds.ts`; `exercise-insights` tone union gains `'red'` and loses `'tangerine'`.

Mapping (from the spec rule: Hyrox or primary action is `signal`, bad news is `red`, caution is `amber`):

| Call site                                                | Today                                   | Becomes                                                              |
| -------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| `KINDS.hyrox.tone`                                       | tangerine                               | `signal`                                                             |
| `HEART_RATE_COLOR`, `GOAL_COLOR`                         | tangerine                               | `var(--color-signal)`                                                |
| `REPS_COLOR`                                             | tangerine                               | `var(--color-plum)`                                                  |
| `ZONE_STYLES[4]`, `[5]`                                  | tangerine, tangerine-deep               | `var(--color-amber)`, `var(--color-red)` (dash and marker unchanged) |
| `SELECTED_COLOR` (bar chart selection)                   | tangerine                               | `var(--color-ink)`                                                   |
| goal pace icon disc                                      | `bg-tangerine`                          | `bg-signal` (icon only, no text)                                     |
| week dots, a day with a run                              | `bg-tangerine text-on-brand`            | `bg-blue text-on-brand` (run is blue)                                |
| strength "slipping" block, exercise insights `declining` | tangerine                               | `red`                                                                |
| race delta, slower than target                           | tangerine                               | `red`                                                                |
| coach entry icon                                         | `bg-tangerine/10 text-tangerine`        | `bg-signal/10 text-signal-strong` (primary action)                   |
| Hyrox station chip in laps                               | `bg-tangerine-soft text-tangerine-deep` | `bg-signal-soft text-signal-deep`                                    |
| button variant `tangerine`                               | key                                     | renamed `signal` (unused today)                                      |

- [ ] **Step 1: Write the failing tests**

- `kinds.test.ts`: `it('colours Hyrox with the signal tone')` expects `KINDS.hyrox.tone` toBe `'signal'`; `it('keeps run blue and strength plum')`.
- `series-styles.test.ts`: `REPS_COLOR` toBe `'var(--color-plum)'`; `ZONE_STYLES[4].color` toBe `'var(--color-amber)'`; `ZONE_STYLES[5].color` toBe `'var(--color-red)'`; `it('never uses orange for zones')` every zone colour does not contain `signal` or `tangerine`; every zone pair differs in dash or marker.
- `race-card-view.test.tsx`: `it('marks a slower result than target in red')` renders a race with `resultTimeS > targetTimeS` and expects `getByTestId('race-delta-<id>')` to have attribute `data-tone` equal to `'red'`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/modules/calendar src/modules/dashboard/progress src/modules/races`
Expected: the three new tests FAIL with `'tangerine'` received.

- [ ] **Step 3: Apply the mapping table, set the `default` button to ink, and delete the temporary aliases from `theme.css`**

- [ ] **Step 4: Verify nothing still references removed names**

Run: `grep -rnE "tangerine|navy|accent-blue|accent-green|chart-[1-5]|sidebar-(ring|border|accent|primary|foreground)\b" src`
Expected: no output. Then `pnpm test` all green.

- [ ] **Step 5: Check, then commit**

Run: `pnpm fmt && pnpm check && pnpm knip && pnpm test`

```bash
git add -A src
git commit -m "refactor(design): give orange one meaning, move bad news to red"
```

### Task 3: Remove the dark theme

**Files:**

- Delete: `src/styles/theme-dark.css`
- Modify: `src/styles/globals.css` (drop `@import './theme-dark.css'` and `@custom-variant dark`)
- Modify: `src/components/ui/{badge,button,select,textarea,input,dropdown-menu}.tsx` (drop every `dark:*` class)
- Modify: `src/components/ui/sonner.tsx` (no `useTheme`, pass `theme="light"`)
- Modify: `package.json`, `pnpm-lock.yaml` (`pnpm remove next-themes`)
- Modify: `src/app/layout.tsx` (`themeColor: '#f5f5f3'`)
- Modify: `src/app/manifest.ts`, `src/app/__tests__/manifest.test.ts`

**Interfaces:**

- Consumes: `paper` value from Task 1.

- [ ] **Step 1: Update the failing test**

In `manifest.test.ts`, rename the case to `'uses the Soft Studio ground for the background and the theme'` and expect `background_color` and `theme_color` toBe `'#f5f5f3'`.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/app/__tests__/manifest.test.ts`
Expected: FAIL, received `'#f7f4ee'`.

- [ ] **Step 3: Apply the file changes listed above**

- [ ] **Step 4: Verify**

Run: `grep -rnE "\bdark:|next-themes|theme-dark|f7f4ee" src package.json`
Expected: no output. `pnpm test` all green.

- [ ] **Step 5: Check, then commit**

Run: `pnpm fmt && pnpm check && pnpm knip && pnpm test`

```bash
git add -A src package.json pnpm-lock.yaml
git commit -m "refactor(design): drop the unused dark theme, light only"
```

### Task 4: Outfit and the type scale

**Files:**

- Modify: `src/app/layout.tsx` (load `Outfit` from `next/font/google` with `variable: '--font-outfit'`, weights `400 500 600`, `display: 'swap'`; remove `Geist` and `Anton`; keep `Geist_Mono`)
- Modify: `src/styles/font.css` (`--font-sans` and `--font-display` to `var(--font-outfit)`; keep `--font-mono` and `--text-md`)
- Modify: `src/styles/globals.css` (`body` letter-spacing `-0.005em`, `font-size: 15px`, `line-height: 1.5`; `.display` block; new `.type-*` classes; `.eyebrow` pill; delete `.display-hero`, `.display-card`, `.display-giant`, `.display-section`)
- Modify: `src/app/(app)/races/page.tsx:10`, `src/modules/settings/settings-view.tsx:10`, `src/modules/activity/activity-view.tsx:186` (`display display-section` becomes `type-title`)
- Test: `src/styles/__tests__/theme.test.ts` (extend, reads `globals.css` and `font.css`)

**Interfaces:**

- Produces: CSS classes `.display`, `.type-display`, `.type-title`, `.type-heading`, `.type-subheading`, `.type-metric`, `.type-metric-xl`, `.eyebrow`, all in `@layer components`.

Values (mobile, then `md:` via `@media (width >= 48rem)`):

| Class              | Size                    | Weight | Line height | Tracking | Extra                                                                                          |
| ------------------ | ----------------------- | ------ | ----------- | -------- | ---------------------------------------------------------------------------------------------- |
| `.display`         | inherits call-site size | 600    | 1.1         | -0.03em  | no `text-transform`                                                                            |
| `.type-display`    | 40px, 56px              | 600    | 1           | -0.04em  |                                                                                                |
| `.type-title`      | 28px, 36px              | 600    | 1.08        | -0.03em  |                                                                                                |
| `.type-heading`    | 20px, 22px              | 600    | 1.2         | -0.02em  |                                                                                                |
| `.type-subheading` | 16px                    | 500    | 1.3         | -0.01em  |                                                                                                |
| `.type-metric`     | 28px                    | 500    | 1           | -0.03em  | `tabular-nums`                                                                                 |
| `.type-metric-xl`  | 56px                    | 500    | 1           | -0.045em | `tabular-nums`                                                                                 |
| `.eyebrow`         | 10px                    | 500    | 1           | 0.16em   | uppercase, `font-sans`, `inline-flex rounded-full bg-sunken px-2.5 py-1 text-muted-foreground` |

- [ ] **Step 1: Write the failing tests**

Extend `theme.test.ts`:

- `it('uses Outfit for sans and display')`: `font.css` maps `--font-sans` and `--font-display` to `var(--font-outfit)`, and contains no `anton` or `geist-sans`.
- `it('keeps display titles in sentence case')`: the `.display {...}` block in `globals.css` has no `uppercase` and has `font-weight: 600`.
- `it('defines the type scale')`: each class in the table above appears as a selector in `globals.css`; `.display-giant`, `.display-hero`, `.display-card`, `.display-section` do not.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test src/styles/__tests__/theme.test.ts`
Expected: the three new cases FAIL.

- [ ] **Step 3: Apply the file changes**

Keep the existing comment in `globals.css` that explains why sizes are component classes and not `--text-*` keys (tailwind-merge); reword it for `.type-*`.

- [ ] **Step 4: Verify**

Run: `pnpm test` (all green; `run-progress-view.test.tsx` asserts eyebrow text only, so it must still pass) and `grep -rn "display-section\|display-hero\|display-card\|display-giant\|font-anton" src` (no output).

- [ ] **Step 5: Check, then commit**

Run: `pnpm fmt && pnpm check && pnpm knip && pnpm test`

```bash
git add -A src
git commit -m "feat(design): Outfit and the Soft Studio type scale"
```

### Task 5: Pill buttons

**Files:**

- Modify: `src/components/ui/button.tsx`
- Test: `src/components/ui/__tests__/button.test.tsx` (create)

**Interfaces:**

- Consumes: `ink`, `paper`, `card`, `sunken`, `signal-strong`, `red-soft`, `red-deep`, `hairline`, `shadow-soft`, `ease-spring` from Task 1.
- Produces: unchanged `Button` props and `buttonVariants` export. Variants: `default`, `ink` (alias of `default` while 2 call sites use it), `signal`, `white`, `outline` (same look as `white`), `paper`, `tone`, `outline-ink`, `secondary`, `ghost`, `destructive`, `link`. Sizes unchanged in name.

Styles:

- Base: `rounded-full`, `transition-[transform,background-color,box-shadow] duration-200 ease-spring active:scale-[0.97]` (replaces `active:not-aria-[haspopup]:translate-y-px` and `transition-all`); drop every `dark:` (already gone after Task 3).
- `default` and `ink`: `bg-ink text-paper hover:bg-ink/90`.
- `signal`: `bg-signal-strong text-on-brand hover:brightness-95`.
- `white` and `outline`: `bg-card text-ink shadow-soft ring-1 ring-hairline hover:bg-sunken/60`.
- `paper`: `bg-paper text-ink hover:bg-sunken`. `secondary`: `bg-sunken text-ink hover:bg-sunken/70`. `ghost`: `text-muted-foreground hover:bg-sunken hover:text-ink`.
- `outline-ink`: `bg-transparent text-ink shadow-[inset_0_0_0_1.5px_var(--ink)] hover:bg-ink/5`.
- `destructive`: `bg-red-soft text-red-deep hover:bg-red-soft/80`.
- Sizes: `default` `h-12 md:h-10 px-5 gap-2`; `lg` `h-12 px-6`; `xl` stays `h-14`; `xs`, `sm`, `icon*` keep heights but lose `rounded-[min(...)]` (base `rounded-full` wins).

- [ ] **Step 1: Write the failing test**

`button.test.tsx` renders `<Button data-testid="btn" variant=... size=...>` and asserts on `className`:

- `it('is a full pill at every size')`: for each size, class contains `rounded-full` and not `rounded-[min`.
- `it('is 48px tall on mobile and 40px from md up')`: default size contains `h-12` and `md:h-10`, not `h-10!`.
- `it('puts white text only on the strong signal')`: `variant="signal"` contains `bg-signal-strong` and `text-on-brand`.
- `it('makes the default button ink')`: contains `bg-ink`, not `bg-accent-blue`.
- `it('presses by scaling')`: contains `active:scale-[0.97]`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/components/ui/__tests__/button.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the variant and size styles above in `buttonVariants`**

- [ ] **Step 4: Verify**

Run: `pnpm test` (all green, including drawer, confirm dialog and `upload-activity-drawer` tests).

- [ ] **Step 5: Check, then commit**

Run: `pnpm fmt && pnpm check && pnpm knip && pnpm test`

```bash
git add src/components/ui/button.tsx src/components/ui/__tests__/button.test.tsx
git commit -m "feat(design): pill buttons with a 48px mobile target"
```

### Task 6: Cards and the liquid glass nav

**Files:**

- Modify: `src/components/ui/card.tsx` (`Card` root: replace `border border-ink/10` with `ring-1 ring-hairline shadow-soft`)
- Modify: `src/components/mobile-nav.tsx:~130-160` (visual tuning only)
- Test: `src/components/__tests__/mobile-nav.test.tsx` (create only if none exists; otherwise extend)

**Interfaces:**

- Consumes: `hairline`, `shadow-soft`, `shadow-lift`, `card`, `ink` from Task 1. `MobileNav` props and drag/spring behaviour are unchanged.

Nav styles: container `bg-white/55 backdrop-blur-2xl backdrop-saturate-[1.8] shadow-lift` plus an inset rim `shadow-[inset_0_1px_0_rgba(255,255,255,.95),inset_0_0_0_1px_rgba(255,255,255,.6)]` (combine with `shadow-lift` in one arbitrary value); active bubble `bg-white/90`; coach button `bg-ink text-paper`; reduced transparency fallback `bg-card` instead of `bg-paper`.

- [ ] **Step 1: Write the failing test**

`it('falls back to a solid card when transparency is reduced')`: render `MobileNav` (with the providers the existing app-shell test uses), get the nav container by its `data-testid` (add `data-testid="mobile-nav"` if missing), expect its class to contain `[@media(prefers-reduced-transparency:reduce)]:bg-card`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/components/__tests__`
Expected: FAIL (`bg-paper` today).

- [ ] **Step 3: Apply the card and nav styles**

- [ ] **Step 4: Verify**

Run: `pnpm test` all green.

- [ ] **Step 5: Check, then commit**

Run: `pnpm fmt && pnpm check && pnpm knip && pnpm test`

```bash
git add src/components/ui/card.tsx src/components/mobile-nav.tsx src/components/__tests__
git commit -m "feat(design): soft cards and tuned liquid glass nav"
```

### Task 7: Docs and whole-app verification

**Files:**

- Modify: `docs/tech-specs/ux-design.md` (rewrite the design system parts for Soft Studio)
- Modify: `docs/tech-specs/2026-11-21-design-system-design.md` (status line to `Status: implemented.`)

- [ ] **Step 1: Rewrite `ux-design.md`**

Remove the "follows BrewStock exactly" intro and the "Source of truth in BrewStock" table; state that Roxcoach owns the Soft Studio system and link the design doc. Replace "Tokens in use" with the neutrals, hues (with `signal-strong`) and the orange rule; replace the activity colour table (Hyrox `signal`, run `blue`, strength `plum`, cross `slate`, race `amber` with flag, rest `sunken` no fill, done `green`, danger `red`); add sections for type scale, buttons, radii, elevation and motion (values copied from the spec); in Layout, change "Light and dark themes through next-themes, as in BrewStock" to "Light only" and the nav fallback to solid card. No em-dashes.

- [ ] **Step 2: Whole-repo checks**

Run: `grep -rnE "tangerine|navy|accent-blue|\bdark:|font-anton|display-section|f7f4ee" src docs/tech-specs/ux-design.md`
Expected: no output (except historical mentions inside the design doc, which is not searched).
Run: `pnpm fmt && pnpm check && pnpm knip && pnpm test && pnpm build`
Expected: all green.

- [ ] **Step 3: Visual check on a phone width**

Ask the athlete before starting the dev server. With their yes: open dashboard, calendar, races, an activity, settings and the coach panel at 375px wide. Check Review Focus items 4 and 5 (drawer and confirm dialog footers with 48px buttons do not clip; long `.display` titles wrap or truncate as before), that no element renders without colour, and that the nav glass reads over content. Fix anything found in the owning task's files and re-run Step 2.

- [ ] **Step 4: Commit**

```bash
git add docs/tech-specs/ux-design.md docs/tech-specs/2026-11-21-design-system-design.md
git commit -m "docs(design): ux-design spec now describes Soft Studio"
```
