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
| Done           | green                          |

Color is never the only carrier of meaning. Every chip has an icon (Tabler icons, as in BrewStock)
and a text label.

## Product register and principles

Register: product (a tool, not a marketing site). Personality: sharp, minimal, trustworthy, a
coach that respects your time.

1. **Quiet authority.** Hierarchy, spacing and typography carry the design. No decoration.
2. **One thing at a time.** Each screen has one job.
3. **Show the work.** Coach answers quote the numbers they are based on.
4. **Respect the decision.** No gamification: no streaks, no confetti, no badges.
5. **Honest empty and error states.** Always say what happened and what to do next.

Anti-references: chatbot bubbles, "AI" sparkle iconography, social feeds, dashboards with many
competing widgets, generic fitness-app gradients.

Accessibility: WCAG AA contrast, visible focus, full keyboard use, `prefers-reduced-motion`
respected, screen-reader labels on every icon-only control and on every calendar cell.

## Layout

- App shell: top bar with the logo, primary nav (Dashboard, Races, Settings) and a user menu
  with logout. On mobile the nav becomes a bottom bar.
- Page container: `main-container` (max-w-5xl) for reading pages, `main-container-lg` for the
  dashboard calendar.
- Light and dark themes through `next-themes`, as in BrewStock.
- Mobile first: the athlete will mostly check this on a phone.

## Screens

| Route              | Access    | Job                                                            |
| ------------------ | --------- | -------------------------------------------------------------- |
| `/login`           | public    | sign in                                                        |
| `/dashboard`       | protected | the calendar and this week at a glance                         |
| `/activities/[id]` | protected | one workout: numbers, laps, station results                    |
| `/races`           | protected | list, create, edit races and goals                             |
| `/settings`        | protected | profile, weekly availability, Lyfta connection and manual sync |

`/` redirects to `/dashboard` when signed in, to `/login` otherwise.

### Login

A centered card on the paper ground: logo, email, password, one primary button. Inline field
errors, a single generic failure message, a loading state on submit. No links to sign up or reset
a password. Follows the BrewStock form pattern (`Form`, `FormField`, `FormControl`, `FormMessage`).

### Dashboard

Current state (plan 2): the mocks are gone. The dashboard shows only real data: the week strip
(time, sessions, run km and load ratio from the last 35 days of activities, zeros and
"No history yet" without activities, activities only), the calendar (activities plus upcoming and
completed races, never cancelled; the week strip and week totals count activities only) and the
`NextRace` card (see below). The "Log session"
and "Add details" items below return with manual logging. The `/coach` and `/plan` screens
no longer exist: the coach is the chat panel on the dashboard (see Coach chat below). `/races` is live (see Races below); `/settings` holds profile, availability and Lyfta tabs. "Today" comes
from `athlete.getTimezone` (`todayIn(timezone)`), never from the browser clock.

The dashboard header has an "Upload activity" button (`UploadActivityDrawer`, `src/modules/dashboard/`)
that opens a right-hand drawer: an informational banner on accepted formats, a file input, a
"This is a Hyrox session" checkbox (hidden for GPX) and an Upload button. States are idle,
uploading, error (message inside the drawer) and success (drawer closes, "Activity uploaded" toast,
data refreshes). Full contract in [manual-upload.md](manual-upload.md). Components in
`dashboard/`: `dashboard-content`, `week-strip`, `week-strip-view`, `upload-activity-drawer`,
`use-upload-activity`, `next-race` and `next-race-view`.

Target design, top to bottom:

1. **This week strip**: done sessions, total minutes, run km and the acute:chronic ratio with a
   plain-language label (for example "Balanced", "Ramping fast").
2. **Next race** (`NextRace` client query with `NextRaceView` for the markup):
   the next upcoming race (date today or later) as an amber card with a flag icon: name, date, days
   to go, goal time and priority (for example "A: Target race"), linking to `/races`. Hidden when
   there is no upcoming race.
3. **Calendar** (the main element), month view on desktop:
    - Each day cell shows up to 3 chips: completed activities (filled, with duration) and races
      (amber tone, flag icon, name and priority letter, linking to `/races`). Races never appear
      when cancelled and are ignored by the week totals,
      the load ratio and the week strip. A "+N" overflow opens the day.
    - Today is outlined with the ink token.
    - Navigation: previous, next, today, and a month and week toggle. The dashboard URL stores
      the calendar cursor date (`date`) and selected view (`view`) with nuqs, so a refresh restores
      the same month or week. Mobile always renders the week agenda, regardless of the stored view.
    - Selecting a day opens a side panel (a bottom sheet on mobile) listing everything that day,
      with a link into each activity. A race shows as an amber card (flag, "Race", priority, name,
      "Goal h:mm:ss") linking to `/races`.
    - Mobile defaults to a week agenda: one row per day, same chips, horizontally compact.
4. **Coach chat**: a launcher bar fixed at the bottom of the viewport (see Coach chat below). The
   dashboard content has bottom padding so the last calendar row stays reachable.

The calendar is fed by `training.getCalendar({ from, to })`, a single query. Target state: it
returns activities and races for the visible range, typed as a discriminated union on `type`
(`activity`, `race`; the race member carries a `RaceSummaryDTO`), merged and ordered by date. Races
come from `listRacesInRange` (upcoming and completed, never cancelled). Every switch on `type` is
exhaustive (`Match.exhaustive`). After a races mutation the
Races page invalidates `training.getCalendar` and `races.list` (`runRaceAction` with an injected
`onChanged`), since `router.refresh()` does not reach client queries.

The dashboard loads its timezone, 35-day week strip, upcoming races and calendar through tRPC
client queries. React Query retains their results while navigating between routes and revalidates
them after 30 seconds; uploads and race or profile mutations invalidate the relevant queries.
Cached results render immediately on return while stale results refresh in the background. The
client query cache is cleared on logout.

### Activity detail

- Header: name, date, category chip.
- Key numbers: distance, time, average pace, average and max heart rate, effort.
- Laps table with pace per lap and station tags (Hyrox).
- Strength activities show duration, total volume and body weight when available. Lyfta's total
  volume is preferred; otherwise it is calculated only when every set has reps and load. Exercise
  groups follow the stored workout order. Each group shows its sets in set order with reps, load in
  kg and RIR when any set has it. Legacy sets without exercise order fall back to exercise name;
  missing values show a dash. An activity without sets gets an honest empty state.
- Station results and other activity details when present, plus "Add details" (see
  [manual-logging.md](manual-logging.md)).

### Coach chat

The one place the coach speaks. See [coach-chat.md](coach-chat.md). It is a client island
(`CoachChat`) mounted in `DashboardContent`; there are no `/coach` or `/plan` routes.

- **Launcher**: a bar fixed at the bottom ("Ask your coach...", above the mobile bottom nav) that
  opens the panel. The panel is a full-height container on narrow screens and a fixed bottom-right
  panel (26rem wide) from the `md` breakpoint (a CSS-only switch, no portal). Escape or the close
  button returns to the launcher. Focus moves to the input on open.
- **Header**: the coach title, a conversations menu (new conversation, past conversations with
  open, delete with an inline "Delete this conversation?" confirmation) and close. The panel opens
  on the latest conversation once, unless the athlete already started one.
- **Empty state**: greeting and three chips ("How is my training going?", "Am I on track for my
  next race?", "What should I do this week?"); a chip sends its text.
- **Messages**: user text is plain text; assistant text is markdown (`react-markdown`, no raw HTML,
  no images, links filtered and opened with `noopener`). The list follows new text unless the
  athlete scrolled up. A screen-reader live region announces the finished reply once, not each delta.
- **Input**: Enter sends, Shift+Enter adds a line; send is disabled while streaming, where a stop
  button appears. A hint shows near 2000 characters and sending is blocked above it. No microphone.
- **States**: empty, loading history (skeleton), streaming, stopped or cut off (partial text kept
  and labelled "Incomplete reply"), error with retry ("The coach is busy, try again in a minute",
  retry resends the same text), blocked ("The coach cannot answer that. Try rephrasing."), limit
  ("You reached today's message limit"), sign-in again (401, 403), not set up (503).

### Races

`/races` is a server component (`RacesView`, inside `Suspense`) that reads the races, the profile
division and the athlete timezone through `createCaller()`, then hands them to the thin client
wrapper `RacesManager` (mutations through `trpcClient.races.*`, a fixed-copy toast and
`router.refresh()`). `RacesList` renders:

- A "New race" button (`race-new`) opening `RaceFormDrawer` (create and edit), right-side on
  desktop and a bottom sheet on mobile. Fields: name, type, date (must be after the athlete's
  today), location, distance in km (running only), division (Hyrox only, defaults to the profile
  division), goal time `h:mm:ss`, priority and notes. The form sends no distance unless the race is
  running and no division unless it is Hyrox. Blank location and notes are stored as NULL.
- Upcoming races sorted by date as cards (`RaceCardView`): name, date, days to go (from the
  athlete's today), type (with the division), location, goal time, priority chip (A: Target race,
  B: Tune-up, C: Training race) and, for running races, the required pace (`requiredPaceMps` through
  `formatPace`). Actions: Edit, Complete (`CompleteRaceDialog`: result time with the goal and the
  delta shown while typing), Cancel and Delete. Complete shows a result dialog; Cancel and Delete
  show accessible confirmation dialogs with the race name and consequence. Delete is hidden once a
  race has a result, and its confirmation explains that deletion is irreversible and mentions linked planned sessions (stale copy, planned sessions no longer exist).
- A collapsed history (`<details>`) with completed races (result and delta in plain text, for
  example "1:42 slower than goal") and cancelled races (marked Cancelled, Delete only).
- Empty state: "No races yet. Add one to get a coach plan."

### Settings

Three tabs (`SettingsTabs`, default Profile): Profile and Weekly availability use
`trpcClient.athlete.*` through thin wrappers (`ProfileTab`, `AvailabilityTab`); Lyfta uses
`trpcClient.lyfta.*` for credential management and manual workout sync. All tabs have loading and
error states; profile and availability show toasts on save. Lyfta connection and sync states are
specified in [lyfta.md](lyfta.md).

- **Profile** (`ProfileForm`, hook `use-profile-form`): name, timezone (select of common IANA zones,
  the saved zone is kept when it is not listed), max and resting heart rate, Hyrox division, weekly
  hours cap and notes for the coach. Number fields are entered as text and converted; an empty
  optional field is saved as null. Ranges come from `PROFILE_LIMITS`
  (`src/_bff/core/constants/athlete.constants.ts`), shared with the server.
- **Weekly availability** (`AvailabilityEditorView`, pure state in `use-availability-editor`): a
  7-column week (Monday to Sunday). Each day has an "Add" menu (open slot or fixed commitment per
  kind, or rest day), chips with a remove button, and a summary line "N sessions per week, up to
  H h". A rest day is exclusive; the same kind cannot be added twice on a day.

## Components

Reuse shadcn components on base-ui only: Button, Card, Dialog, Sheet, Form, Input, Select, Tabs,
Tooltip, Skeleton, Badge, Sonner for toasts. Selects use the BrewStock pattern (label from
`SelectValue` children). New project-specific components live in `src/modules/<feature>/`:

The shared `Drawer` component opens from the right on desktop and from the bottom on mobile.
Feature drawers use this default instead of checking the viewport themselves. An explicit
direction is available only when a drawer intentionally needs different behavior.

Form drawers share `DrawerFormLayout`: a bold title and close control, a scrollable body, and
Cancel plus the primary action in a fixed footer. Footer actions stack vertically at full width on
mobile and sit side by side at equal widths on desktop. Race forms and activity upload use this
layout.

| Component   | Purpose                                                      |
| ----------- | ------------------------------------------------------------ |
| `calendar/` | month grid, week agenda, day panel, chips                    |
| `activity/` | metrics row, laps table, details dialog                      |
| `coach/`    | chat panel, history menu, message, chips                     |
| `races/`    | race card, race form                                         |
| `settings/` | profile form, availability editor, Lyfta connection and sync |

## States every screen must handle

Loading (skeletons shaped like the final content), empty (explains why and offers the next
action, for example "No races yet. Add one to get a coach plan."), error (what failed, one retry
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
