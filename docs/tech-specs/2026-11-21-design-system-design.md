# Design system: Soft Studio

Status: implemented. Scope: the foundation (tokens, fonts, type scale, buttons, radii,
elevation, motion). Screen redesigns come after, one screen at a time, on top of this.

## Intent

The athlete wants to transform the look of the whole app while keeping the dashboard layout. The
reference is a modern fitness app: near-white ground, a rounded geometric typeface, black pill
buttons, nested cards, a glass panel over an image, small coloured dots for state and a single
orange for alerts. Mobile is the priority: the app is mostly used installed on a phone. The mobile
liquid glass navbar stays and is tuned to the new look.

This replaces the BrewStock design system. Roxcoach stops mirroring BrewStock and owns its own
system from here on; `docs/tech-specs/ux-design.md` changes in the same change to say so.

## Goals

- One coherent light theme, named Soft Studio, defined as tokens in `src/styles/theme.css`.
- Outfit as the only typeface for display, body and numbers, with a documented type scale that
  is sized for a phone first.
- Activity colours re-tuned so that orange means Hyrox and the main action, and nothing else.
- Every existing screen keeps working and picks up the new look through the tokens, with no
  screen left broken or unreadable.
- Dead tokens from the BrewStock copy removed.

## Non-goals

- Dark mode. The app is light only. It is already effectively light only (`colorScheme: 'light'`,
  no theme provider, no `.dark` class applied), so this removes the unused dark theme instead of
  dropping a working feature.
- Redesigning individual screens, cards or layouts. That is the next phase.
- Icon family changes (today a mix of Tabler and Lucide). Separate step.
- Photography. The app has no imagery; image-led cards will use gradients or data visuals, decided
  per screen.

## Anti-goals

- Orange used for anything other than Hyrox, the primary call to action and the logo dot.
  Errors and destructive actions are red.
- Colour as the only carrier of meaning. Chips keep an icon and a text label.
- Dark, harsh shadows or 1px grey borders. Hairline rings (ink at low alpha) only.
- Text below WCAG AA contrast, especially muted text on the ground colour.

## Approaches

Considered:

- **A. Change values, keep token names.** Lowest risk, but leaves BrewStock names and dead
  aliases that no longer describe anything.
- **B. New token architecture from scratch** (primitive, semantic, component) and migrate every
  component. Cleanest result, but touches nearly every UI file before anything improves and leaves
  the app half broken during the migration.
- **C. A plus targeted cleanup.** Change values, delete dead aliases and unused tokens, and rename
  only where a token's meaning changed.

**Picked: C** (the athlete's choice). It keeps the blast radius of A while leaving a base that
reads correctly for the screen redesigns that follow.

## Decided

### Theme

Light only. Delete `src/styles/theme-dark.css`, its import in `globals.css`, the
`@custom-variant dark` line and every `dark:` variant in `src/` (about 7 files, mostly shadcn
components). `src/components/ui/sonner.tsx` stops reading `next-themes` and uses `theme="light"`;
remove `next-themes` from `package.json` if nothing else uses it. Update `themeColor` in
`src/app/layout.tsx` and `background_color` / `theme_color` in `src/app/manifest.ts` to the new
ground `#F5F5F3`.

### Neutrals

| Token                | Value                | Use                                                                     |
| -------------------- | -------------------- | ----------------------------------------------------------------------- |
| `--paper`            | `#F5F5F3`            | page ground (name kept: still the page)                                 |
| `--card`             | `#FFFFFF`            | cards, sheets, popovers                                                 |
| `--sunken`           | `#EBEBE8`            | new: pills, inputs, day cells, tracks                                   |
| `--ink`              | `#121214`            | text, primary button                                                    |
| `--muted-foreground` | `rgba(18,18,20,.6)`  | secondary text                                                          |
| `--ink-45` (new)     | `rgba(18,18,20,.45)` | captions, placeholders (large or non-essential text only, see contrast) |
| `--hairline`         | `rgba(18,18,20,.07)` | rings and dividers                                                      |
| `--hairline-strong`  | `rgba(18,18,20,.12)` | input rings, emphasised dividers                                        |

Muted text and hairlines stay alpha over ink. shadcn's semantic tokens (`--background`,
`--foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--muted`, `--accent`,
`--popover`, `--border`, `--input`, `--ring`) are remapped onto these values so every component
follows. `--muted` becomes `--sunken`; `--secondary` and `--accent` become `--sunken` with ink
foreground.

### Hues

Each hue keeps the base / `-soft` (surface) / `-deep` (text on soft) triplet.

| Hue token                           | Base      | Soft      | Deep      | Meaning                                                           |
| ----------------------------------- | --------- | --------- | --------- | ----------------------------------------------------------------- |
| `signal` (renamed from `tangerine`) | `#FF5B2E` | `#FFE7DE` | `#A8320F` | Hyrox, primary CTA, logo dot, heart rate and goal lines in charts |
| `blue`                              | `#3D6BF5` | `#E3EAFF` | `#1C3A99` | run                                                               |
| `plum`                              | `#8A5CF0` | `#EEE6FF` | `#4B2A9E` | strength                                                          |
| `slate`                             | `#6B7080` | `#E9EAEE` | `#30333D` | cross-training, other                                             |
| `amber`                             | `#F5A524` | `#FFF1D4` | `#8A5203` | race, always with the flag icon                                   |
| `green`                             | `#2F9E5B` | `#DCF3E5` | `#14582F` | done, positive deltas                                             |
| `red` (new)                         | `#D92D2D` | `#FDE4E4` | `#8F1A1A` | destructive, errors                                               |

- `tangerine` is renamed to `signal` because its meaning changed from "one hue among many" to
  "the brand accent". The `tangerine` references in `src/` (about 11 files) do not all move to
  `signal` blindly, since that would break the orange anti-goal (builder's call recorded here):
    - `KINDS.hyrox` in `src/modules/calendar/kinds.ts`, `HEART_RATE_COLOR` and `GOAL_COLOR` in
      `src/modules/dashboard/progress/series-styles.ts`: `signal`.
    - `REPS_COLOR`: `plum` (reps are strength work).
    - HR zones in `ZONE_STYLES`: zone 4 `amber`, zone 5 `red` (dash and marker unchanged, so
      zones never rely on colour alone).
    - `data-tone="tangerine"` for "slower than target" in `src/modules/races/race-card-view.tsx`:
      `red`.
    - Any other usage: decided case by case by the same rule (Hyrox or primary action is `signal`,
      bad news is `red`, caution is `amber`).
- `signal-strong` (new, `#CC3D15`) is the fill for any signal surface that carries white text:
  the `signal` button and the notification badge. White on it is 5.0:1. The bright `signal`
  `#FF5B2E` stays for dots, chips (as a dot next to `signal-deep` text on `signal-soft`), chart
  lines and the logo dot, where no text sits on it. The athlete chose this over a black label on
  the bright orange and over the reference's white on bright orange (3.1:1, fails AA).
- `navy` is removed. It is only defined (`theme.css`, `tone.css`), never used.
- `--destructive` points to `red`. `--positive` points to `green`. `--warning` points to
  `amber-deep`.
- `tone.css` keeps working the same way, with `tangerine` renamed to `signal`, `navy` removed and
  a `red` tone added. In the `signal` tone, `--tone` is `signal-strong` (tone fills carry
  `--tone-ink` text). `--tone-ink` on `signal`, `blue`, `plum`, `green`, `red` is white
  (`--on-brand`); on `amber` it stays `amber-deep`. The builder measures white on the `blue`,
  `plum` and `green` bases and uses the `-deep` shade as the tone fill for any that fail AA.

### Typography

Outfit (Google, via `next/font/google`, variable `--font-outfit`) replaces Geist Sans and Anton.
Geist Mono stays only for code, kbd and similar (`font-mono`). `--font-sans` and
`--font-display` both point to Outfit. Body letter-spacing goes from `-0.15px` to `-0.005em`.
Numbers in metrics use `font-variant-numeric: tabular-nums`.

Sentence case everywhere. Anton is removed from `layout.tsx`. The bare `.display` class (about 43
call sites: page h1s, dialog, drawer and day-panel titles, the app-shell logo) stays and becomes
Outfit 600, `letter-spacing: -0.03em`, `line-height: 1.1`, no `text-transform`. Call sites keep
their own size utilities, so this is a CSS change, not a migration (builder's call). Sites that
add `font-bold` keep it. Screens move to `.type-*` when they are redesigned.

Scale (mobile, then from `md:` up):

| Class                                  | Size      | Weight | Line height | Tracking          | Use                                       |
| -------------------------------------- | --------- | ------ | ----------- | ----------------- | ----------------------------------------- |
| `.type-display`                        | 40 → 56px | 600    | 1.0         | -0.04em           | page hero line                            |
| `.type-title`                          | 28 → 36px | 600    | 1.08        | -0.03em           | page title                                |
| `.type-heading`                        | 20 → 22px | 600    | 1.2         | -0.02em           | section and card titles                   |
| `.type-subheading`                     | 16px      | 500    | 1.3         | -0.01em           | list item titles                          |
| body (`text-[15px]` default on `body`) | 15px      | 400    | 1.5         | -0.005em          | reading text                              |
| small                                  | 13px      | 400    | 1.45        |                   | secondary lines (`text-md`, already 13px) |
| caption                                | 12px      | 400    | 1.4         |                   | meta (`text-xs`)                          |
| `.eyebrow`                             | 10px      | 500    |             | 0.16em, uppercase | kicker pill above titles                  |
| `.type-metric`                         | 28px      | 500    | 1.0         | -0.03em           | stat values                               |
| `.type-metric-xl`                      | 56px      | 500    | 1.0         | -0.045em          | hero numbers (countdown, race time)       |

These are component classes in `@layer components`, not `--text-*` theme keys, for the reason
already documented in `font.css` and `globals.css`: a `text-*` key would be read by
tailwind-merge as a conflicting text utility and dropped when a text colour is applied to the same
element. `.display-section` (3 call sites) is replaced by `.type-title`. `.display-hero`,
`.display-card`, `.display-giant` and `GiantWord` are unused and are removed. The `.eyebrow` class changes from mono 13px to the pill style above (sunken
background, `rounded-full px-2.5 py-1`).

### Buttons

`src/components/ui/button.tsx` keeps its API; variant styles change:

- Every size is a full pill (`rounded-full`), including `xs`, `sm`, `lg`, `xl` and the `icon*`
  sizes, which drop their `rounded-[min(...)]` radii (builder's call).
- Heights: `default` goes from the hard `h-10!` to `h-12 md:h-10` (48px on mobile, 40px from
  `md:` up). This also applies in drawer footers and `ConfirmDialog`, where 48px is the better
  thumb target. `lg` becomes `h-12`, `xl` stays `h-14`; `xs`, `sm` and `icon*` keep their heights.
  Tests that assert on these classes (for example `upload-activity-drawer.test.tsx`) are updated.
- `default` becomes ink background, paper text (today it is `bg-accent-blue`). `ink` stays as an
  alias of `default` only if call sites need it; otherwise merged.
- Kept and restyled through tokens (builder's call): `tone` (contextual, unchanged behaviour),
  `paper` (paper background, ink text, for buttons on a white card), `outline-ink` (inset 1.5px
  ink ring), `outline` (card background with a hairline ring, the same look as `white`; merged
  into `white` if call sites allow).
- `signal` (renamed from `tangerine`): `signal-strong` background, white text. Used for the one primary
  call to action per screen (for example "Ask coach").
- `white` becomes the secondary style: card background, soft shadow and hairline ring.
- `secondary` becomes sunken background, ink text. `ghost` stays transparent with muted text.
- `destructive` becomes `red-soft` background with `red-deep` text.
- Pressed state: `active:scale-[0.97]` with the motion curve below, replacing `translate-y-px`.
- A trailing arrow icon sits in its own circle (`size-9 rounded-full`, translucent over the
  button colour) flush with the right padding. This is a composition pattern documented in the
  spec and used when screens are redesigned; it is not a new variant.

### Radii

`--radius` base moves to 16px. Named radii: 12 (small controls), 16 (inputs, chips), 22 (inner
cards), 28 (outer cards and sheets), full (buttons, pills, nav). `--radius-surface` stays 28px and
`--radius-surface-inner` becomes 22px. Nested cards use concentric radii: inner = outer minus the
padding.

### Elevation

Two shadow tokens, both very diffused, no dark drop shadows:

- `--shadow-soft`: `0 1px 2px rgba(18,18,20,.04), 0 12px 32px -18px rgba(18,18,20,.18)`
- `--shadow-lift`: `0 2px 4px rgba(18,18,20,.04), 0 24px 48px -24px rgba(18,18,20,.28)`

Exposed as Tailwind `shadow-soft` and `shadow-lift`. Cards default to `shadow-soft` plus a
hairline ring instead of a border.

### Motion

One curve, `--ease-spring: cubic-bezier(0.32, 0.72, 0, 1)` (Tailwind `ease-spring`): 200ms for
presses, 500ms for state changes, 700ms for entries (fade up 12px). `--ease-out-strong` is kept:
`.faq-accordion` in `globals.css` uses it. Everything respects `prefers-reduced-motion`.

### Liquid glass navbar

`src/components/mobile-nav.tsx` keeps its behaviour (springing, draggable active bubble). Visual
tuning only: white at about 55% with `backdrop-blur` and `backdrop-saturate`, a bright inset rim,
`--shadow-lift` below; active item a near-opaque white bubble; the centered coach button in ink.
The `prefers-reduced-transparency` fallback changes from `bg-paper` to a solid `bg-card`.

### Cleanup

Removed: `theme-dark.css`; `--sidebar-*` and `--chart-1..5` tokens (unused in components); the
legacy aliases `--accent-blue`, `--accent-blue-dark`, `--accent-blue-light`, `--accent-green`,
`--accent-green-light`, `--primary-muted` (the only usage is `bg-accent-blue` in the `default`
button variant, which becomes ink); `navy`; Anton; `.display-hero`, `.display-card`,
`.display-giant`. Every removal is checked with a
search of `src/` and `pnpm knip` before it goes.

### Docs

`docs/tech-specs/ux-design.md` is rewritten for Soft Studio: drop the BrewStock source-of-truth
section, replace the tokens and activity colour tables, add the type scale, buttons, radii,
elevation and motion. This design doc stays as the record of the decision.

## Contrast

All text pairs must pass WCAG AA. Known checks for the builder:

- `muted-foreground` (ink 60%) on `paper` and on `card`: passes AA for body text.
- `ink-45` on `paper`: below 4.5:1, so only for captions of 18px+ or non-essential text
  (placeholders). If a usage needs AA at small sizes, use `muted-foreground`.
- White on `signal` `#FF5B2E` is 3.1:1 and fails AA, so text never sits on it. White on
  `signal-strong` `#CC3D15` is 5.0:1 and passes.
- `-deep` text on `-soft` surfaces: all pass AA by construction; verify each pair.

## Left to the builder

- Exact Outfit weights to load (at least 400, 500, 600).
- Whether `ink` and `default` button variants merge or stay as aliases, based on call sites.
- Which existing usages of removed tokens map to which new token, case by case.
- Updating any test that asserts on class names or copy affected by the uppercase removal.
