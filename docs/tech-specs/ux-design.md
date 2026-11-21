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

- App shell: a left sidebar with the logo and primary nav (Dashboard, Calendar, Races, Settings),
  plus a Log out button at its bottom (a direct button, not a dropdown). On a phone the top bar
  has a Log out icon button (no dropdown). On mobile use a compact top bar and a floating bottom
  navigation pill ("liquid glass": blurred backdrop, bright rim, solid fallback under
  `prefers-reduced-transparency`) with five items: Dashboard, Calendar, the coach button (centered,
  filled, opens the coach panel), Races and Settings. Page content reserves `pb-28` above it.
- Page container: `main-container` (max-w-5xl) for reading pages, `main-container-lg` for the
  dashboard and calendar.
- Light and dark themes through `next-themes`, as in BrewStock.
- Mobile first: the athlete will mostly check this on a phone.
- Installable app (PWA), following the Next.js PWA guide: `src/app/manifest.ts` (name Roxcoach,
  `start_url` `/dashboard`, `standalone`, paper color for background and theme, 192 and 512 icons
  plus a maskable one), the icons in `public/` (`web-app-manifest-192x192.png`,
  `web-app-manifest-512x512.png`, `apple-touch-icon.png`; the proxy matcher already lets these names
  through without a session), and in the root layout `viewportFit: 'cover'`, `themeColor` and
  `appleWebApp` so it runs full screen on a phone. The icon is a rising line ending in a dot on the
  ink color. It needs HTTPS to be offered for installation. On a phone, a bottom sheet
  (`InstallPrompt`, mounted in the root layout so it is offered on the login page too, before
  signing in) offers installing the app about 1.5 s
  after opening it: with the browser's `beforeinstallprompt` event (Chrome, Edge) an "Install app"
  button opens the native install dialog; on iOS Safari, which cannot install from code, the sheet
  shows the Share, Add to Home Screen steps and a "Got it" button. "Not now", swiping the sheet away
  or declining the native dialog saves `roxcoach:install-prompt-dismissed` in localStorage (the time of the dismissal) and the
  sheet stays away for 72 hours, after which the value is stale (and removed) and the sheet is
  offered again; an old flag or a corrupt or future value counts as stale; it never shows when the app already runs installed
  (`display-mode: standalone`) or on a wide screen. When storage is blocked the choice is simply not
  remembered. Out of scope on purpose: web push
  notifications (they need VAPID keys, a stored subscription and a sender) and offline caching with
  a service worker; neither is required to install the app.

## Screens

| Route              | Access    | Job                                                            |
| ------------------ | --------- | -------------------------------------------------------------- |
| `/login`           | public    | sign in                                                        |
| `/dashboard`       | protected | training progress overview                                     |
| `/calendar`        | protected | activity and race calendar, activity upload                    |
| `/activities/[id]` | protected | one workout: numbers, laps, station results                    |
| `/races`           | protected | list, create, edit races and goals                             |
| `/settings`        | protected | profile, weekly availability, Lyfta connection and manual sync |

`/` redirects to `/dashboard` when signed in, to `/login` otherwise.

### Login

A centered card on the paper ground: logo, email, password, one primary button. Inline field
errors, a single generic failure message, a loading state on submit. No links to sign up or reset
a password. Follows the BrewStock form pattern (`Form`, `FormField`, `FormControl`, `FormMessage`).

### Dashboard

The dashboard is focused on training progress, not the calendar. It shows the real-data weekly
summary (time, sessions, run km and the acute:chronic load ratio from the last 35 days of
activities, with zeros and "No history yet" when there is no history) and, below it, progress
charts for the athlete's chosen mode. The **Running** or **Strength** choice is a segmented control at the bottom of the
desktop sidebar and in its own Settings tab, Dashboard (so a phone user, who has no sidebar, can change it); it is
saved in `athlete_profiles.dashboard_mode` (applied at once, reverted with a toast if the save
fails) and is not on the dashboard page. A control on the page sets the range (3M, 6M, 1Y), kept in the URL
(`range`, default `6m`). Running follows a training-app layout: the days of this week, a headline
with a bar per week (distance, time or runs, tap a bar or step with the arrows), the goal pace, the
latest runs, the pace trend with the goal pace line, pace by heart rate zone and average heart rate; Strength shows training volume and workouts per week as bars, then one card per top exercise (the top 4 by default, one below the other, or one exercise chosen from a
dropdown on desktop and a bottom drawer on a phone), each with its
picture, the latest top set and an area chart of its top set over time. In strength mode the week strip has no run distance
tile and its time and sessions count strength workouts only. Every chart has a text summary for screen readers; there are no data tables, only charts. Full behavior, data and design
rules are in [dashboard-progress.md](dashboard-progress.md). "Today" comes from the athlete
timezone in `athlete.getProfile` (`todayIn(timezone)`), never from the browser clock. Upcoming races remain on `/races`. A shared action group offers activity upload
and manual Lyfta sync.

The dashboard loads its profile (timezone and mode), the 35-day summary and the progress series through tRPC client queries. React Query
retains the summary while navigating between routes and revalidates it after 30 seconds. Uploads
invalidate the calendar and both progress queries, which refreshes the calendar, summary and charts. The client query
cache is cleared on logout.

### Calendar

The `/calendar` page owns the activity calendar. Dashboard and Calendar share an action group with
"Upload activity" and "Sync Lyfta". Upload opens the existing drawer with its idle, uploading,
error and success states; Lyfta sync is manual and uses the connection and feedback behavior in
[lyfta.md](lyfta.md). See [manual-upload.md](manual-upload.md) for upload details.

The calendar is fed by `training.getCalendar({ from, to })`, a single query, returning activities
and upcoming or completed races for the visible range, never cancelled races. Items are typed as a
discriminated union on `type` (`activity`, `race`; the race member carries a `RaceSummaryDTO`),
merged and ordered by date. Every switch on `type` is exhaustive (`Match.exhaustive`).

- Desktop defaults to a month grid; mobile always shows a week agenda.
- Navigation supports previous, next, Today, and a month/week toggle. The URL stores the cursor
  date (`date`) and selected view (`view`) with nuqs, so refresh restores the same calendar view.
- Each day shows up to three activity or race chips. A "+N" overflow opens the day panel. Races
  link to `/races` and do not count as training activity or load.
- Selecting a day opens a side panel, or a bottom sheet on mobile, with links to its activities.
- The calendar page uses the athlete timezone from `athlete.getTimezone`, never the browser clock.
- After a race mutation, the Races page invalidates `training.getCalendar` and `races.list`
  (`runRaceAction` with an injected `onChanged`), since `router.refresh()` does not reach client
  queries.

### Activity detail

- Header: name, date, category chip. The document title uses the activity name, followed by the
  root title template (`| Roxcoach`).
- Key numbers: distance, time, average pace, average and max heart rate, effort.
- Laps table with pace per lap and station tags (Hyrox).
- Strength activities show duration, total volume and body weight when available. Lyfta's total
  volume is preferred; otherwise it is calculated only when every set has reps and load. Exercise
  groups follow the stored workout order and show the name with Lyfta's optional image. Sets appear
  in set order as a numbered list with reps, load in kg and RIR when any set has it. Do not show
  rest timers. Legacy sets without exercise order fall back to exercise name; missing images or
  values remain honest. An activity without sets gets an empty state.
- Station results and other activity details when present, plus "Add details" (see
  [manual-logging.md](manual-logging.md)).

### Coach chat

The one place the coach speaks. See [coach-chat.md](coach-chat.md). It is a client island
(`CoachChat`) mounted in the authenticated app layout, available across app pages; there are no
`/coach` or `/plan` routes.

- **Launcher**: from `md` up, a bar fixed at the bottom ("Ask your coach...") that opens the panel.
  On mobile there is no bar: the centered coach button in the bottom nav opens it (the open state
  is shared through `CoachPanelProvider`).
  The desktop bar has an X that hides it (with a toast saying where to bring it back). The desktop
  sidebar has a "Coach" row with a switch that shows or hides the bar. The preference lives in the
  `coach_enabled` cookie (`"0"` = hidden, written by the client, 1 year) rather than localStorage,
  so the server layout reads it (`cookies()` inside a `Suspense`, as the app uses
  `cacheComponents`) and the first paint is already correct, with no flash. It only controls the
  desktop bar: the mobile nav button always opens the coach. The panel is a full-height container on narrow screens and a fixed bottom-right
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
- **Model caption**: a small muted line (`coach-model-caption`) under the message box, inside the
  panel, naming the model that wrote the latest reply by its friendly name (an unknown id shows
  the raw id). One line with an ellipsis in the narrow panel. A reopened conversation shows the
  model of its last assistant message with a stored model; a new conversation, or a history with
  no stored model, shows nothing. An error keeps the last known caption.
- **Switch note**: when a reply came from a fallback model, a muted, small, centered line
  (`coach-model-switch-note`) "<from> is not available right now. Answering with <to>." sits in the message
  list right before that reply. It is in-session only (not stored, absent in reopened
  conversations), is not an alert and is not announced by the live region.
- **States**: empty, loading history (skeleton), streaming, stopped or cut off (partial text kept
  and labelled "Incomplete reply"), error with retry ("The coach is busy, try again in a minute",
  retry resends the same text), blocked ("The coach cannot answer that. Try rephrasing."), limit
  ("You reached today's message limit"), sign-in again (401, 403), not set up (503).

### Races

`/races` loads the races, profile division and athlete timezone through tRPC client queries in
`RacesView`. Their 30-second stale time lets the shared QueryClient keep data across navigation;
cached results remain visible during background refetches. Initial loading and query errors have
their own skeleton and retry state. Mutations in `RacesManager` invalidate `races.list` and
`training.getCalendar` without refreshing the page. `RacesList` renders:

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
  race has a result, and its confirmation explains that deletion is irreversible and the coach will no longer see the race.
- A collapsed history (`<details>`) with completed races (result and delta in plain text, for
  example "1:42 slower than goal") and cancelled races (marked Cancelled, Delete only).
- Empty state: "No races yet. Add one so your coach knows your goal."

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

Dialogs are centered on desktop and open as bottom sheets on mobile, using the shared `Dialog`
component. Dialogs inherit this behavior without page-specific positioning.
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
action, for example "No races yet. Add one so your coach knows your goal."), error (what failed, one retry
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
