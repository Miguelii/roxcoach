This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Strava setup

1. Register an app at <https://www.strava.com/settings/api>. Set the authorization callback domain
   to the app's domain (use `localhost` for development).
2. Set these variables in the app environment (see `docs/tech-specs/specs/architecture.md` for the full table):
   `NEXT_STRAVA_CLIENT_ID`, `NEXT_STRAVA_CLIENT_SECRET`, `NEXT_STRAVA_WEBHOOK_VERIFY_TOKEN` (any long
   random string you choose) and `NEXT_PUBLIC_WEBSITE_URL` (the public https URL of the app, used
   for the OAuth redirect and the webhook callback).
3. Create a Trigger.dev project and put its project ref in `trigger.config.ts`. The ref committed
   there is the maintainer's own, so a fresh clone must replace it. Set `TRIGGER_SECRET_KEY` in the
   app environment: it is different for the Trigger.dev dev and prod environments, so use the one
   that matches where the app runs.
4. Set the job variables in the Trigger.dev dashboard. The jobs run in Trigger's cloud, not in the
   app, so they do not see the app environment. In the project's Environment Variables page, for
   each environment (dev and prod), set `NEXT_SUPABASE_URL`, `NEXT_SUPABASE_PUBLISHABLE_KEY`,
   `NEXT_SUPABASE_SERVICE_ROLE_KEY`, `NEXT_STRAVA_CLIENT_ID` and `NEXT_STRAVA_CLIENT_SECRET`.
5. Deploy the jobs with `pnpm trigger:deploy`.
6. With the app deployed and reachable, create the webhook subscription once. Load the variables
   from step 2 into the shell (`set -a; source .env.local; set +a`), then run
   `pnpm dlx tsx tools/strava-subscription.ts create`. Use `view` to see the existing subscription
   and `delete <id>` to remove it.
7. Open Settings and press "Connect Strava". The first sync runs through the backfill job and
   imports the last 12 months, so the activity count fills in over a few minutes. If Strava rate
   limits it, press "Sync now" to resume where it stopped.

### Human checklist (not covered by automated tests)

- Run `pnpm trigger:dev` once and confirm the jobs index without a `server-only` error (this proves
  the `react-server` bundle condition in `trigger.config.ts`).
- Confirm a deployed job does not fail at runtime on a missing variable: after connecting, check
  the Trigger.dev run for `backfill-strava` and look for an environment validation error.
- Do one real OAuth round trip: connect, check the "Strava connected" message, the activity count,
  then disconnect and reconnect.
- Record one activity on Strava (or edit one) and confirm one real webhook delivery arrives and the
  activity appears in the app within a couple of minutes.
