# UX design

Roxcoach follows BrewStock's design system exactly: same tokens, same fonts, same component
library, same tone. Only the product copy and the screens change.

## Source of truth in BrewStock

| Asset              | BrewStock path                                                   | Roxcoach                      |
| ------------------ | ---------------------------------------------------------------- | ----------------------------- |
| Global styles      | `src/styles/globals.css`                                         | copy as is                    |
| Fonts              | `src/styles/font.css` (Geist Sans, Geist Mono, Anton as display) | copy as is                    |
| Color tokens       | `src/styles/theme.css`                                           | copy as is                    |
| Tones              | `src/styles/tone.css`                                            | copy as is                    |
| Dark theme         | `src/styles/theme-dark.css`                                      | copy as is                    |
| UI components      | `src/components/ui/*` (shadcn on base-ui)                        | copy only the components used |
| Product principles | `PRODUCT.md`                                                     | adapted below                 |

Only the product copy and logo change. When BrewStock's design system changes, port it here
deliberately instead of drifting.

## Tokens in use

Page ground is warm cream (`--paper`), ink is near-black (`--ink`), cards are white (`--card`).
Brand hues each have a base, a `-soft` tint and a `-deep` shade: blue, navy, green, amber,
tangerine, slate. Hairlines and muted text are alpha over ink. Light text on a saturated surface
uses `--on-brand`. Never hardcode colors: use semantic tokens (`bg-primary`,
`text-muted-foreground`, `text-primary-foreground`) and `cn()` for class merging.

## Activity color mapping

| Meaning        | Token                          |
| -------------- | ------------------------------ |
| Run            | blue                           |
| Hyrox          | tangerine                      |
| Strength       | navy                           |
| Cross-training | slate                          |
| Race           | amber, always with a flag icon |
| Rest           | slate-soft, no fill            |
| Done, on plan  | green                          |
| Missed         | amber-deep text on amber-soft  |

Color is never the only carrier of meaning. Every chip has an icon (Tabler icons, as in BrewStock)
and a text label.

## Product register and principles

Register: product (a tool, not a marketing site). Personality: sharp, minimal, trustworthy, a
coach that respects your time.

1. **Quiet authority.** Hierarchy, spacing and typography carry the design. No decoration.
2. **One thing at a time.** Each screen has one job.
3. **Show the work.** Reports name the numbers they are based on. Plans state why.
4. **Respect the decision.** No gamification: no streaks, no confetti, no badges.
5. **Honest empty and error states.** Always say what happened and what to do next.

Anti-references: chatbot bubbles, "AI" sparkle iconography, social feeds, dashboards with many
competing widgets, generic fitness-app gradients.

Accessibility: WCAG AA contrast, visible focus, full keyboard use, `prefers-reduced-motion`
respected, screen-reader labels on every icon-only control and on every calendar cell.

## Layout

- App shell: top bar with the logo, primary nav (Dashboard, Coach, Plan, Races, Settings) and a user menu
  with logout. On mobile the nav becomes a bottom bar.
- Page container: `main-container` (max-w-5xl) for reading pages, `main-container-lg` for the
  dashboard calendar.
- Light and dark themes through `next-themes`, as in BrewStock.
- Mobile first: the athlete will mostly check this on a phone.

## Screens

| Route              | Access    | Job                                             |
| ------------------ | --------- | ----------------------------------------------- |
| `/login`           | public    | sign in                                         |
| `/dashboard`       | protected | the calendar and this week at a glance          |
| `/activities/[id]` | protected | one workout: numbers, laps, station results     |
| `/coach`           | protected | the weekly reports and the coach's memory       |
| `/plan`            | protected | next sessions and the outlook toward each race  |
| `/races`           | protected | list, create, edit races and goals              |
| `/settings`        | protected | profile, weekly availability, Strava connection |

`/` redirects to `/dashboard` when signed in, to `/login` otherwise.

### Login

A centered card on the paper ground: logo, email, password, one primary button. Inline field
errors, a single generic failure message, a loading state on submit. No links to sign up or reset
a password. Follows the BrewStock form pattern (`Form`, `FormField`, `FormControl`, `FormMessage`).

### Dashboard

Current state (plan 2): the mocks are gone. The dashboard shows only real data: the week strip
(time, sessions, run km and load ratio from the last 35 days of Strava activities, zeros and
"No history yet" without activities) and the calendar with completed activities only. The
planned-session and race chips, "Next up", "Latest report", "Log session" and "Add details" below
return with the plans that own them. `/plan`, `/races` and `/coach` render a "coming soon" page
until their backend ships; `/settings` renders the Strava card (profile and availability return
with a later plan). "Today" comes
from `athlete.getTimezone` (`todayIn(timezone)`), never from the browser clock.

Target design, top to bottom:

1. **This week strip**: planned versus done sessions, total minutes versus the plan, acute:chronic
   ratio with a plain-language label (for example "Balanced", "Ramping fast").
2. **Next up**: the next planned session (title, description, target) and the next race with
   days remaining and goal.
3. **Calendar** (the main element), month view on desktop:
    - Each day cell shows up to 3 chips: completed activities (filled, with duration), planned
      sessions (outlined), races (amber flag). A "+N" overflow opens the day.
    - Today is outlined with the ink token. Past planned sessions with no match show as missed.
    - Navigation: previous, next, today, and a month and week toggle.
    - Selecting a day opens a side panel (a bottom sheet on mobile) listing everything that day,
      with "Log session" and a link into each activity.
    - Mobile defaults to a week agenda: one row per day, same chips, horizontally compact.
4. **Latest report** card under the calendar: the headline of the last weekly report, its week, a
   link to `/coach` and when the next one arrives (Sunday 20:00).

The calendar is fed by `training.getCalendar({ from, to })`, a single query. Target state: it
returns activities, planned sessions and races for the visible range, typed as a discriminated
union on `type` (`activity`, `planned`, `race`). Today `CalendarItem` has the `activity` member
only; the `planned` member arrives with plan 5 and the `race` member with plan 3.

### Activity detail

- Header: name, date, category chip, link to the activity on Strava when it came from Strava.
- Key numbers: distance, time, average pace, average and max heart rate, effort.
- Laps table with pace per lap and station tags (Hyrox).
- Station results and strength sets when present, plus "Add details" (see
  [manual-logging.md](manual-logging.md)).

### Coach

The one place the coach speaks. See [coach.md](coach.md).

- **Header**: when the next report arrives ("Sunday 22 Nov, 20:00"), and "Generate now".
- **Latest report** expanded: headline, week numbers (time, sessions, run km, load), summary,
  went well, watch out, **follow-ups** (earlier concerns with a status chip: resolved, open,
  worse), next week focus, a link to the plan, and the goal check when present.
- **Memory panel**: which previous reports feed the next one (up to 3), shown as small chips with
  the week and headline. It makes the "remembers 3 weeks" behaviour visible.
- **Earlier reports**: collapsed list, one entry per week, opening to the same layout.
- States: no report yet (explains the Sunday schedule), generating (skeleton), failed (what
  happened and a retry).

### Plan

See [plan.md](plan.md). A header with the latest report headline and a link to `/coach`, the
current and next week as sections with per-session rows (mark done, skip, move), an "Outlook"
section with one card per upcoming race, and a note when a race or availability change came after
the last report.

### Races

A list of upcoming races as cards (name, date, days to go, type, goal time, priority chip), a
"New race" button opening a dialog form, and collapsed history. Completed races show goal versus
result with the delta in plain text.

### Settings

Target: three sections: Profile, Weekly availability (7-column editor), Strava (connection status,
connect or disconnect, last sync time, "Sync now", attribution).

Current state (plan 2): only the Strava card is built. Disconnected it offers "Connect Strava";
connected it shows the last sync ("Not synced yet" when none), the activity count, "Sync now" and
"Disconnect" (with a confirmation step). The callback result (`?strava=`) shows as a message above
the card, and the "Compatible with Strava" attribution is always visible. See
[strava.md](strava.md#settings-card).

## Components

Reuse shadcn components on base-ui only: Button, Card, Dialog, Sheet, Form, Input, Select, Tabs,
Tooltip, Skeleton, Badge, Sonner for toasts. Selects use the BrewStock pattern (label from
`SelectValue` children). New project-specific components live in `src/modules/<feature>/`:

| Component   | Purpose                                    |
| ----------- | ------------------------------------------ |
| `calendar/` | month grid, week agenda, day panel, chips  |
| `activity/` | metrics row, laps table, details dialog    |
| `coach/`    | report view, follow-up chips, memory panel |
| `plan/`     | week section, session row                  |
| `races/`    | race card, race form                       |
| `settings/` | availability editor, Strava card           |

## States every screen must handle

Loading (skeletons shaped like the final content), empty (explains why and offers the next
action, for example "No races yet. Add one to get a plan."), error (what failed, one retry
action) and offline or stale (a muted "Updated 2 hours ago" line where sync matters).

## Copy rules

English, direct, no hype. Numbers use the shared formatters in
`src/_bff/core/utils/formatters.utils.ts`: pace as `m:ss /km`, durations as `h:mm:ss` or
`mm:ss`, distances in km with one decimal, loads in kg. A missing value renders as a dash or is
omitted, never as "N/A" text from the database.

## Smoke tests

Every element tested is located by `data-testid`. Target state: end-to-end smoke tests with page
objects in `e2e/pos/*.po.ts` (there is no `e2e` directory yet; today only unit and component tests
exist, and the mock data is gone). Initial flows: login success and failure, the calendar renders
activities from seeded data, create a race, save weekly availability.
