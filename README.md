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
2. Set these variables in the environment (see `specs/architecture.md` for the full table):
   `NEXT_STRAVA_CLIENT_ID`, `NEXT_STRAVA_CLIENT_SECRET`, `NEXT_STRAVA_WEBHOOK_VERIFY_TOKEN` (any long
   random string you choose) and `NEXT_PUBLIC_WEBSITE_URL` (the public https URL of the app, used
   for the OAuth redirect and the webhook callback).
3. Create a Trigger.dev project, put its project ref in `trigger.config.ts` and set
   `TRIGGER_SECRET_KEY` in the app environment.
4. Deploy the jobs with `pnpm trigger:deploy`.
5. With the app deployed and reachable, create the webhook subscription once. Load the four
   variables from step 2 into the shell, then run
   `pnpm dlx tsx tools/strava-subscription.ts create`. Use `view` to see the existing subscription
   and `delete <id>` to remove it.
6. Open Settings and press "Connect Strava". The first sync imports the last 12 months.

### Human checklist (not covered by automated tests)

- Run `pnpm trigger:dev` once and confirm the jobs index without a `server-only` error (this proves
  the `react-server` bundle condition in `trigger.config.ts`).
- Do one real OAuth round trip: connect, check the "Strava connected" message, the activity count,
  then disconnect and reconnect.
- Record one activity on Strava (or edit one) and confirm one real webhook delivery arrives and the
  activity appears in the app within a couple of minutes.
