# UX design

Roxcoach owns its design system, Soft Studio: light only, mobile first, one rounded geometric
typeface, pill buttons, nested soft cards and a liquid glass navbar. The decision, the full token
tables and the reasoning are in
[2026-11-21-design-system-design.md](2026-11-21-design-system-design.md). This file is the working
summary; when they differ, update both in the same change.

## Tokens in use

All tokens live in `src/styles/theme.css` (values) and `src/styles/tone.css` (contextual tones).
Never hardcode colors: use semantic tokens (`bg-primary`, `text-muted-foreground`, `bg-sunken`) and
`cn()` for class merging.

- **Neutrals:** page ground `--paper` `#F5F5F3`, cards `--card` `#FFFFFF`, pills, inputs and tracks
  `--sunken` `#EBEBE8`, text and primary button `--ink` `#121214`. Muted text, captions (`--ink-45`,
  large or non-essential text only) and hairlines are alpha over ink, never standalone greys.
- **Hues**, each with a base, a `-soft` tint (surfaces, chips) and a `-deep` shade (text on the
  tint): `signal`, `blue`, `plum`, `slate`, `amber`, `green`, `red`. Light text on a saturated
  surface uses `--on-brand`.
- **Orange rule:** `signal` (`#FF5B2E`) means only Hyrox, the primary call to action, the logo dot
  and the heart rate and goal lines in charts. White text never sits on it (3.1:1); a fill that
  carries white text uses `signal-strong` (`#CC3D15`, 5.0:1). Bad news is `red`, caution is `amber`.
- **Tones:** `data-tone="<hue>"` remaps `--tone`, `--tone-soft`, `--tone-deep` and `--tone-ink`.
  `--tone` is always a fill that carries `--tone-ink` at AA, so the `plum` and `green` tones fill
  with their deep shade.
- **Elevation:** `shadow-soft` and `shadow-lift` (very diffused, never dark). Cards use a hairline
  ring plus `shadow-soft` instead of a border.
- **Cards are single layer:** white `bg-card` with `shadow-soft` and the 28px radius, no outline, no
  outer frame or ring. (The nested shell-and-core look was tried and dropped: its frame read as an
  outline.)
- **Radii:** `--radius` 16px; 22px inner cards (`--radius-surface-inner`), 28px outer cards and
  sheets (`--radius-surface`), full for buttons, pills and the nav. Nested cards use concentric
  radii (inner = outer minus the padding).
- **Motion:** `ease-spring` = `cubic-bezier(0.32, 0.72, 0, 1)`; 200ms presses, 500ms state changes,
  700ms entries. Respect `prefers-reduced-motion`.

## Typography

Outfit (`--font-outfit`, weights 400, 500, 600) for display, body and numbers; Geist Mono only for
code. Sentence case everywhere. The bare `.display` class sets face, weight 600 and tracking and
leaves the size to the call site. The scale is component classes in `globals.css`, not `--text-*`
keys (tailwind-merge would drop a text-size key when a text colour is applied):

| Class                | Mobile / md+ | Weight | Use                           |
| -------------------- | ------------ | ------ | ----------------------------- |
| `.type-display`      | 40 / 56px    | 600    | page hero line                |
| `.type-title`        | 28 / 36px    | 600    | page title                    |
| `.type-heading`      | 20 / 22px    | 600    | section and card titles       |
| `.type-subheading`   | 16px         | 500    | list item titles              |
| body (default)       | 15px         | 400    | reading text                  |
| `text-md`, `text-xs` | 13px, 12px   | 400    | secondary lines, captions     |
| `.eyebrow`           | 10px caps    | 500    | kicker pill above titles      |
| `.type-metric`       | 28px         | 500    | stat values (tabular figures) |
| `.type-metric-xl`    | 56px         | 500    | hero numbers                  |

## Buttons

`Button` (`src/components/ui/button.tsx`): every size is a full pill, 48px tall on mobile and 40px
from `md:` up for the default size. `default` is ink, `signal` is `signal-strong` with white text
(one primary action per screen), `white` and `outline` are card colour with a soft shadow and a
hairline ring, `secondary` is sunken, `destructive` is `red-soft` with `red-deep` text. Pressing
scales to 97%. A trailing arrow icon sits in its own circle flush with the right padding; it is a
composition pattern, not a variant.

## Activity color mapping

| Meaning        | Token                          |
| -------------- | ------------------------------ |
| Run            | blue                           |
| Hyrox          | signal                         |
| Strength       | plum                           |
| Cross-training | slate                          |
| Race           | amber, always with a flag icon |
| Rest           | sunken, no fill                |
| Done, positive | green                          |
| Danger, errors | red                            |

Color is never the only carrier of meaning. Every chip has an icon (Tabler icons) and a text
label; chart zones also differ by dash and marker.

## Product register and principles

Register: product (a tool, not a marketing site). Personality: sharp, minimal, trustworthy, a
coach that respects your time.

1. **Quiet authority.** Hierarchy, spacing and typography carry the design. No decoration.
2. **One thing at a time.** Each screen has one job.
3. **Show the work.** Coach answers quote the numbers they are based on.
4. **Respect the decision.** The athlete stays in control of every choice.
5. **Honest empty and error states.** Always say what happened and what to do next.

Anti-references: chatbot bubbles, "AI" sparkle iconography, social feeds, dashboards with many
competing widgets, generic fitness-app gradients.

Accessibility: WCAG AA contrast, visible focus, full keyboard use, `prefers-reduced-motion`
respected, screen-reader labels on every icon-only control and on every calendar cell.

## Layout

- App shell: a left sidebar with the logo and primary nav (Dashboard, Calendar, Races, Settings) and a Logs item after them for admins only (desktop only: the phone bar keeps its items and has no link to Logs),
- App shell loading: the authenticated layout streams the real shell behind a `Suspense` whose fallback is `AppShellSkeleton` (logo and primary links, no active item, admin link or coach toggle), so the app chrome is part of the prerendered static shell and paints before the dynamic render finishes.
  plus a Log out button at its bottom (a direct button, not a dropdown). On a phone the top bar
  has a Log out icon button (no dropdown). On mobile use a compact top bar and a floating bottom
  navigation pill ("liquid glass": white at about 55% over a blurred, saturated backdrop, bright inset rim, lifted
  shadow, solid card fallback under `prefers-reduced-transparency`; a glass bubble marks the active route, springs between items and can be dragged across them, snapping to the nearest route on release; `MobileNav` in `src/components/mobile-nav.tsx`) with five items: Dashboard, Calendar, the coach button (centered,
  filled, opens the coach panel), Races and Settings. It sits low, like Instagram's: its bottom edge is
  at the safe area (the home indicator) with at least 8 px to the screen edge. Page content reserves
  `pb-24` above it.
- Page container: `main-container` (max-w-5xl) for reading pages, `main-container-lg` for the
  dashboard and calendar.
- Light only: there is no dark theme.
- Mobile first: the athlete will mostly check this on a phone.
- Installable app (PWA), following the Next.js PWA guide: `src/app/manifest.ts` (name Roxcoach,
  `start_url` `/dashboard`, `standalone`, paper color `#F5F5F3` for background and theme, 192 and 512 icons
  plus a maskable one), the icons in `public/` (`android-chrome-192x192.png`,
  `android-chrome-512x512.png`, `apple-touch-icon.png`; the proxy matcher already lets these names
  through without a session), and in the root layout `viewportFit: 'cover'`, `themeColor` and
  `appleWebApp` so it runs full screen on a phone. The icon is a rising line ending in a dot on the
  ink color. It needs HTTPS to be offered for installation. On a phone, a bottom sheet
  (`InstallPrompt`, mounted in the root layout so it is offered on the login page too, before
  signing in) offers installing the app about 1.5 s
  after opening it: with the browser's `beforeinstallprompt` event (Chrome, Edge) an "Install app"
  button opens the native install dialog; on iOS Safari, which cannot install from code, the sheet
  shows the Share, Add to Home Screen steps and a "Got it" button. "Not now", swiping the sheet away
  or declining the native dialog saves `roxcoach:install-prompt-dismissed` in localStorage (JSON
  with the time of the dismissal and the build it was made on, `{ at, build }`) and the sheet stays
  away for 72 hours on that same build. After 72 hours, or once a new build is deployed, the value is
  stale (and removed) and the sheet is offered again. The build is `NEXT_BUILD_ID` (the commit
  SHA on Vercel), read by the root layout and passed to `InstallPrompt`; when it is unknown (local
  dev) only the 72 hours apply. An old flag, the old bare time, or a corrupt or future value
  counts as stale; it never shows when the app already runs installed
  (`display-mode: standalone`) or on a wide screen. When storage is blocked the choice is simply not
  remembered. Out of scope on purpose: web push
  notifications (they need VAPID keys, a stored subscription and a sender) and offline caching with
  a service worker; neither is required to install the app.
  When the app runs installed (`display-mode: standalone`), it does not zoom, like a native app:
  `html` gets `touch-action: pan-x pan-y` (no pinch or double-tap zoom, Chrome), and
  `StandaloneZoomLock` (root layout) adds `maximum-scale=1, user-scalable=no` to the viewport and
  blocks iOS `gesturestart`, which also stops iOS zooming into a focused input. In a browser tab
  zoom stays available, for accessibility.

## SEO and share cards

The app is open source and its only public, indexable page is `/login`; every other page needs a
session (the proxy sends crawlers to `/login`) and `/signup` stays `noindex` (access code only).

- **Defaults** live in `SITE_METADATA` (`src/lib/seo.ts`), exported as the root layout's
  `metadata`: title template `%s | Roxcoach`, a description under 160 characters, keywords,
  `robots: index, follow`, and `metadataBase` from `NEXT_PUBLIC_WEBSITE_URL`, so relative URLs
  resolve to the deployed origin.
- **Share card:** Open Graph (`og:type` website, site name, `en_US`) and X (`summary_large_image`)
  both use `public/assets/brag.jpg` (1920x1080), the poster of the README video
  `public/assets/brag.mp4`. Replacing the poster means replacing that file, same name and size.
- **`/login`** sets `alternates.canonical: '/login'`, since protected pages redirect there with a
  `?returnTo=` that would otherwise create duplicate URLs.
- **`robots.txt`** (`src/app/robots.ts`) allows everything except `/api/` and links the sitemap.
  **`sitemap.xml`** (`src/app/sitemap.ts`) lists only `/login`. Both are outside the proxy matcher.
- Tests: `src/app/__tests__/seo.test.ts`.

## Screens

| Route              | Access    | Job                                                                                  |
| ------------------ | --------- | ------------------------------------------------------------------------------------ |
| `/login`           | public    | sign in                                                                              |
| `/signup`          | public    | create an account with an access code (404 while closed)                             |
| `/dashboard`       | protected | training progress overview                                                           |
| `/calendar`        | protected | activity and race calendar, activity upload                                          |
| `/activities/[id]` | protected | one workout: numbers, laps, station results                                          |
| `/races`           | protected | list, create, edit races and goals                                                   |
| `/settings`        | protected | profile, dashboard, weekly goals and run types (`?tab=goals` opens it), integrations |

`/` redirects to `/dashboard` when signed in, to `/login` otherwise.

### Auth layout (login and sign-up)

`src/app/(auth)/layout.tsx` splits both pages side by side from `lg` (1024 px): on the left (3/5 of
the width) the brand video `public/assets/brag.mp4` on the paper ground, sticky at full viewport
height and shown whole (`object-contain`; its own background is paper, so the edges blend); on the
right a white panel with a hairline border and the form centered. Below `lg` the video panel is
hidden and the form is the bordered card centered on paper; from `lg` the card drops its border and
padding, since the white panel already frames it.

The video (`AuthVideo`, `src/modules/auth/auth-video.tsx`) is muted, looping, inline, decorative
(`aria-hidden`) and has `preload="none"` with `brag.jpg` as the poster. It only plays while its panel
is visible (the `lg` media query) and the user has not asked to reduce motion, so a phone never
downloads it; a refused play leaves the poster. A ghost icon button in the bottom left corner
pauses and plays it ("Pause video" / "Play video"), also when reduced motion kept it paused.

### Login

The form card: logo, email, password, one primary button. Inline field
errors, a single generic failure message, a loading state on submit. No link to reset a password;
a link to `/signup` shows only while sign-up is open. Uses the shadcn form pattern (`Form`, `FormField`, `FormControl`, `FormMessage`).

Every secret field (login and sign-up password, Zepp password, Lyfta API key) is a `PasswordInput`
(`src/components/ui/password-input.tsx`): an eye button at the right end of the field shows and
hides what was typed. It is a `type="button"` with `aria-pressed` and a "Show password" / "Hide
password" label (`secretName` changes the noun, "Show API key" for Lyfta), disabled with the input.
Its test id is the input's plus `-toggle`.

### Sign-up

The login card with four fields: name, email, password (8 to 72 characters) and access code, one primary
button ("Create account") and a link back to sign in. One generic failure message for every
refusal. The page is a 404 while sign-up is closed. See [signup-access-code.md](signup-access-code.md).

### Dashboard

The dashboard is focused on training progress, not the calendar. It shows the real-data weekly
summary (time, sessions, run km and the acute:chronic load ratio from the last 35 days of
activities, with zeros and "No history yet" when there is no history) and, below it, progress
charts for the athlete's chosen mode. The **Running** or **Strength** choice is a segmented control at the bottom of the
desktop sidebar and in its own Settings tab, Dashboard (so a phone user, who has no sidebar, can change it); it is
saved in `athlete_profiles.dashboard_mode` (applied at once, reverted with a toast if the save
fails) and is not on the dashboard page. A control on the page sets the range (3M, 6M, 1Y), kept in the URL
(`range`, default `12m`). Running follows a training-app layout: the next race banner and the readiness card (see [dashboard-progress.md](dashboard-progress.md), Race readiness), the days of this week, a headline
with a bar per week (distance, time or runs, tap a bar or step with the arrows), the goal pace, the
latest runs, the pace trend with the goal pace line, pace by heart rate zone and average heart rate; Strength shows training volume and workouts per week as bars, then one card per top exercise (the top 4 by default, one below the other, or one exercise chosen from a
dropdown on desktop and a bottom drawer on a phone), each with its
picture, the latest top set and an area chart of its top set over time. In strength mode the week strip has no run distance
tile and its time and sessions count strength workouts only. Every chart has a text summary for screen readers; there are no data tables, only charts. Full behavior, data and design
rules are in [dashboard-progress.md](dashboard-progress.md). "Today" comes from the athlete
timezone in `athlete.getProfile` (`todayIn(timezone)`), never from the browser clock. Upcoming races remain on `/races`. A shared action group offers activity upload
and manual Lyfta sync.

The dashboard loads its profile (timezone and mode), the 35-day summary and the progress series through tRPC client queries. While they load, the
real header and cards are drawn with placeholders where the values go, never a page of skeleton
blocks (see [dashboard-progress.md](dashboard-progress.md)). React Query
retains the summary while navigating between routes and revalidates it after 30 seconds. Uploads
invalidate the calendar and both progress queries, which refreshes the calendar, summary and charts. The client query
cache is cleared on logout.

### Calendar

The `/calendar` page owns the activity calendar. Dashboard and Calendar share an action group with
"Upload activity" and "Sync". Upload opens the existing drawer with its idle, uploading,
error and success states. "Sync" is one button for every integration (Lyfta and Zepp today,
see [lyfta.md](lyfta.md) and [zepp.md](zepp.md)). It never syncs by itself: it opens a list with one
row per connected integration (name, last sync, a sync icon) and the athlete picks one. An
integration the athlete has not connected is not listed; with none connected the list says so and
links to Settings. The list is a popover under the button on a wide screen and a drawer from the bottom on
a phone (the shared `PopoverDrawer`). Each integration reports through toasts and exposes a
`use-sync-<name>` hook that returns a `SyncSource` (`src/lib/sync-source.ts`); a new integration is
one more hook in the list. A sync runs in the background (see
[2026-11-23-background-sync-design.md](2026-11-23-background-sync-design.md)): pressing a row shows
the info toast "Syncing your activities. They will be available shortly."; while the stored sync
state is `running` the row and the button show a spinner and the row is disabled (also after a
reload, since it comes from the polled status); when the run this tab saw `running` ends, the row
shows the final success or error toast once. A page that loads after the run ended shows no toast,
and the Settings cards show the last result or error inline instead. See [manual-upload.md](manual-upload.md) for upload details.

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
- While a range has no data yet, the real grid is drawn at once (marked `aria-busy`) and the items
  fill in when the query returns. Nothing claims emptiness before that: the month view hides the
  "No activities" line and shows small placeholders in the week totals column instead of "No
  sessions", and the week view shows a placeholder where a day would say "Rest". Moving to another
  range keeps the previous items on screen until the new ones arrive (`keepPreviousData`).
- The calendar page uses the athlete timezone from the profile (`athlete.getProfile`), never the
  browser clock.
- The page reads the profile on the server (after `connection()`), behind one `Suspense` whose
  fallback is `CalendarPageContent` itself, so a return visit draws from the client cache at once.
  The profile reaches the client cache through a `HydrationBoundary`, and the server timezone is
  also passed as `initialTimezone`, which the page renders from until the client query has data
  (the shell creates that query before hydration, so the hydrated value lands after commit). A
  failed server read is left out and the client query fetches it with its own skeleton and error.
  The calendar range is not prefetched: the server cannot tell whether a phone forces the week view.
- After a race mutation, the Races page invalidates `training.getCalendar` and `races.list`
  (`runRaceAction` with an injected `onChanged`), since `router.refresh()` does not reach client
  queries.

### Activity detail

- Header: name, date, category chip. The document title uses the activity name, followed by the
  root title template (`| Roxcoach`).
- Key numbers: distance, time, average pace, average and max heart rate, effort.
- Laps table with pace per lap and station tags (Hyrox).
- Runs (`category = run`) replace the laps table with Strava-style sections: Splits (km, pace, a
  bar per split where the fastest is longest, average HR), a Pace area chart and a Heart rate area
  chart. Charts are plain server-rendered SVG at lap resolution (track points are not stored, see
  `manual-upload.md`), drawn only when there are enough splits (and HR for the HR chart). Elevation
  is not shown because it is not stored per lap.
- Strength activities show duration, total volume and body weight when available. Lyfta's total
  volume is preferred; otherwise it is calculated only when every set has reps and load. Exercise
  groups follow the stored workout order and show the name with Lyfta's optional image. Sets appear
  in set order as a numbered list with reps, load in kg and RIR when any set has it. Do not show
  rest timers. Legacy sets without exercise order fall back to exercise name; missing images or
  values remain honest. An activity without sets gets an empty state.
- Strength detail, all derived from stored sets (helpers in
  `src/_bff/core/helpers/strength-detail.helper.ts`, used by the server and the UI):
    - The workout summary is a set of separate tiles, like the run metrics (white card,
      soft shadow, label and a large value): the headline numbers (duration, total volume, body weight, calories when stored,
      heart rate and effort when present), then what was done (exercises, sets, total reps, heaviest
      set with its exercise, density as volume per minute with a volume and a duration), all in one
      grid. A phone shows two columns: the heaviest set goes last in full width so a long exercise
      name wraps instead of being cut, and a lone tile before it fills its row. From `md` the column
      count follows the tile count so the last row is never a lone tile. Below the grid, one Records
      card lists the records like an activity feed: one row per exercise split by hairlines, a gold
      PR medal, the exercise name as a blue link to its block in the exercise list, then each record
      type in bold with its value, the set behind it and the gain on the same line (wrapping on a
      phone, where the name takes its own line). Lyfta does not
      give calories today, so imported workouts omit them.
    - The Records overview lists each exercise that set a record with a count, one line per
      record type (Weight, 1RM, Set volume, Volume), its value and, when known, the set behind it
      and the gain. A Lyfta activity shows the records Lyfta flagged on its sets (1RM and set
      volume, all-time, no gain because Lyfta does not give the old best); the set that broke one
      also carries a pill, and nothing from our own comparison is mixed in. Any other activity uses
      our comparison with the last `STRENGTH_COMPARISON_HISTORY` workouts: top set (Weight),
      estimated 1RM and the exercise's volume in the workout (Volume), each against the best of the
      earlier workouts, with the gain. With no record it says "No new records this session." (always
      for Lyfta, only with an earlier workout otherwise), and the section is hidden when there is
      nothing to say.
    - Per exercise, next to its name: top set (heaviest load, more reps on a tie), volume with its
      share of the workout, and the estimated 1RM (Epley, one rep is the load itself, only sets of
      1 to 12 reps count). Volume and the top set ignore sets without reps and a positive load.
    - Per exercise, a "Last time" line against the most recent earlier strength workout with the
      same exercise (matched by `exerciseKeyOf`: the Lyfta exercise id, else the lowercase name),
      with the signed change in top set and in volume (each hidden when it did not move) and a
      "Record: ..." pill naming the record types set in the exercise. A first session has no line
      and no record.
    - Per set: a bar scaled to the exercise's top set, a "Top set" pill on the first set that
      matches it, and the set volume at the right.
    - `training.getActivity` returns `strengthComparisons` (`ExerciseComparisonDTO[]`) for strength
      activities with sets: it reads the last `STRENGTH_COMPARISON_HISTORY` (150) earlier strength
      workouts of the user and their sets, as the signed-in user. Other categories get `[]`.
    - `training.getActivity` reads the activity, its laps and its sets in one parallel round-trip
      (laps and sets also filter by `user_id`, so nothing leaks before ownership is known; on a
      miss they are discarded). Only the strength comparison waits on the activity, because it
      needs `started_at`.
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

Four tabs (`SettingsTabs`: Profile, Dashboard, Goals, Integrations; default Profile, `?tab=<name>`
opens another one): Profile and Goals use `trpc.athlete.*` through thin wrappers (`ProfileTab`,
`GoalsTab`); Lyfta uses
`trpc.lyfta.*` for credential management and manual workout sync. All tabs have loading and
error states; profile and goals show toasts on save. Lyfta and Zepp connection and sync
states are specified in [lyfta.md](lyfta.md) and [zepp.md](zepp.md).

- **Profile** (`ProfileForm`, hook `use-profile-form`): name, timezone (select of common IANA zones,
  the saved zone is kept when it is not listed), max and resting heart rate, Hyrox division, weekly
  hours cap and notes for the coach. Number fields are entered as text and converted; an empty
  optional field is saved as null. Ranges come from `PROFILE_LIMITS`
  (`src/_bff/core/constants/athlete.constants.ts`), shared with the server. Below the form,
  `DeleteProfileSection` has a **Delete profile** button that opens a `ConfirmDialog` ("Keep my
  profile" or "Delete everything"). Confirming deletes the account and all the athlete's data (see
  [athlete-races.md](athlete-races.md), "Delete profile"), clears the query cache and goes to
  `/login`; a failure keeps the dialog open with one fixed message.
- **Goals** (`GoalsForm`, hook `use-goals-form`): see
  [2026-11-27-weekly-goals-design.md](2026-11-27-weekly-goals-design.md), "Settings: Goals tab".
  Weekly goals (running km, long runs, fast runs, strength sessions; empty means no goal) and run
  type rules (short run under km, long run over km, fast pace `m:ss`) with a live summary of the
  rule. Save toasts "Goals saved" or "Goals saved. N runs reclassified.".

### Logs

The `/logs` page (`LogsExplorer` in `src/modules/logs`) reads the Roxcoach rows of the shared log
table (see [logs.md](logs.md)). A toolbar has the range pills (`30m`, `1h`, `24h`, `7d`, `30d`, default `30d`) and a
debounced search; both live in the URL. Under it a stacked histogram (30 buckets, one series per
level) in a white card, then pill filters for level (always the four levels, with counts) and for
source, then one card with the list: time, level badge, source, the athlete (display name over the user id, a dash when the log has no user) and message per row (a two line row
on a phone). Tapping a row opens the details in `DetailDrawer`: message, level, source, time, user
and the metadata as formatted JSON with a copy icon that puts the JSON on the clipboard. Level tones: error red, warning amber, info blue, debug slate
(`-soft` fill, `-deep` text). States: a banner when 1000 rows came back (the range is truncated),
"No logs in this time range" when empty and "No logs match these filters" with a clear button when
the filters match nothing.

### Integration cards

Settings > Integrations has one card per integration (Lyfta, Zepp). Each starts with the name and a
state pill ("Connected" or "Not connected", the state is in the text), then the last sync and, once
known, how many activities were imported ("142 workouts imported", "38 runs imported"). The primary
action is `Sync`; `Replace API key` (Lyfta) or `Reconnect` (Zepp) is the secondary one. Below a
divider a "Danger zone" holds `Clear activities` and `Disconnect`, each with a one-line explanation
and a destructive button of at least 44 px, apart from Sync so they are not pressed by mistake.
`Clear activities` is disabled with zero activities, while the count is unknown and while a sync or
another action runs. It opens the shared `ConfirmDialog` ("Clear 142 Lyfta workouts?", the 360 day
caveat, `Clear Lyfta activities` / `Keep activities`); a failure stays in the dialog and a success
closes it with a toast. The backend behaviour is in [lyfta.md](lyfta.md) and [zepp.md](zepp.md).

## Components

Reuse shadcn components on base-ui only: Button, Card, Dialog, Sheet, Form, Input, Select, Tabs,
Tooltip, Skeleton, Badge, Sonner for toasts. Selects take their label from the
`SelectValue` children. New project-specific components live in `src/modules/<feature>/`:

Dialogs are centered on desktop and open as bottom sheets on mobile, using the shared `Dialog`
component. Dialogs inherit this behavior without page-specific positioning.
The shared `Drawer` component opens from the right on desktop and from the bottom on mobile.
Feature drawers use this default instead of checking the viewport themselves. An explicit
direction is available only when a drawer intentionally needs different behavior.

Form drawers share `DrawerFormLayout`: a bold title and close control, a scrollable body, and
Cancel plus the primary action in a fixed footer. Footer actions stack vertically at full width on
mobile and sit side by side at equal widths on desktop. Race forms and activity upload use this
layout.

| Component   | Purpose                                             |
| ----------- | --------------------------------------------------- |
| `calendar/` | month grid, week agenda, day panel, chips           |
| `activity/` | metrics row, laps table, details dialog             |
| `coach/`    | chat panel, history menu, message, chips            |
| `races/`    | race card, race form                                |
| `settings/` | profile form, goals form, Lyfta connection and sync |

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
activities from seeded data, create a race, save weekly goals.

## Dialogs and drawers

Two shared components cover every overlay, and they are the only ones a module may use:

| Case                                                         | Component                                                              |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Confirming an action (delete, cancel, disconnect, one field) | `ConfirmDialog`: popup on desktop, `DrawerFormLayout` drawer on mobile |
| A form (several fields, create or edit)                      | `DrawerFormLayout` inside `Drawer` + `DrawerContent`                   |

Both share the look: bold display title, description, close button in the header, hairline
separators and a footer with Cancel plus the primary action. The base `Dialog*` and `Drawer*`
primitives are never composed directly in a module. If a case does not fit, extend the shared
component.
