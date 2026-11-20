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

## Activity upload

Migration `0008_activity_files.sql` creates the private Storage bucket `activity-files` and the
table `activity_files`. After applying it, confirm in the Supabase dashboard (Storage) that the
bucket exists and is private. The Supabase project is shared with another app: the storage policies
are scoped to this bucket only and touch no other bucket. Details in
`docs/tech-specs/manual-upload.md`.

## Profile, availability and races

Settings holds the athlete profile and the typical week of availability, and `/races` holds the
races with their goals. The coach chat (`docs/tech-specs/coach-chat.md`) reads
the profile, the availability and the races through the `athlete` and `races` services. Rules in
`docs/tech-specs/athlete-races.md`.

## Coach chat

The dashboard has a chat with an AI coach (Google Gemini), described in
`docs/tech-specs/coach-chat.md`.

1. Set `NEXT_GEMINI_API_KEY` in the app environment. The models come from a fixed list in the code.
   Without the key the chat route answers 503 and the panel says the coach is not set up.
2. Check the key against every listed model with `pnpm dlx tsx tools/gemini-smoke.ts` (or one
   model with `pnpm dlx tsx tools/gemini-smoke.ts <model-id>`), with the key loaded in the shell. It
   prints one line per model, `<id>: OK` or `<id>: <status code>` (never the key or the response).
   The key must not be pasted anywhere else.
3. Apply migration `0009_coach_chat.sql` in the Supabase SQL editor (it creates
   `coach_conversations` and `coach_messages` and drops the old report and plan tables).
4. The Gemini free tier is not offered in every region (the EEA, the UK and Switzerland are
   restricted at the time of writing) and its terms allow Google to use requests to improve its
   products. Check the current terms for your region before relying on it.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
