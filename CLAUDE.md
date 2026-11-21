@AGENTS.md

# Project Conventions

Roxcoach is a training coach for Hyrox and running. Specs in `docs/tech-specs/` are binding. Before touching a module, read
`docs/tech-specs/<module>.md` (start from `docs/tech-specs/README.md` and `docs/tech-specs/architecture.md`), and update that spec
in the same change when behavior, data or contracts change.

## General Rules

- ALL code, identifiers, comments, cache keys, error tags and enum values are in English. UI copy is English too.
- Use `pnpm` always. Do not start a dev server unless explicitly asked. Never run vitest directly: use `pnpm test`.
- NEVER use em-dashes in anything: code, comments, UI copy, docs, commit messages. Use commas, colons, parentheses or separate sentences.
- shadcn components use `base-ui`, NEVER Radix.
- Types are declared at the top of the file, never in the middle.
- No unnecessary comments. The component, function or variable name must already say what it does. Only comment non-obvious logic worth documenting (a business rule, a trade-off, a workaround, why something is done a surprising way), never what the code plainly does or why a style was chosen (for example "a real button so it is easy to tap"). Never leave a JSX comment that narrates markup. If a comment restates the name or the next line, delete it.
- Nothing is pushed and no secrets are committed: `.env*` is git-ignored, only `.env.example` is tracked.
- Every commit passes the pre-commit hook (`pnpm fmt`, `pnpm check`, `pnpm knip`). Run `pnpm test` before committing.

## Imports: ALWAYS use the `@/` alias

Never use relative imports (`./`, `../`) for anything under `src/`.

```tsx
// Wrong
import { getSession } from './get-session'
// Correct
import { getSession } from '@/_bff/modules/auth/services/get-session.service'
```

## Code placement

Ownership follows usage.

| Consumers           | Where it lives                                                          |
| ------------------- | ----------------------------------------------------------------------- |
| Frontend and `_bff` | `src/_bff/core/{constants,helpers,utils}/<theme>.<kind>.ts`, one per theme |
| 2+ frontend modules | `src/lib/constants.ts`, `src/lib/formatters.ts`                         |
| A single module     | Colocated `utils.ts` or `constants.ts` next to the deepest consumer     |

- `_bff` never imports from `src/lib`, `src/modules`, `src/components`, `src/hooks` or `src/app`. Anything the frontend and `_bff` both need goes in `src/_bff/core/`, and those files must stay importable from client components (no `server-only`, except `core/db/index.ts`).
- Never duplicate a formatter: read `src/_bff/core/utils/formatters.utils.ts`, `src/lib/formatters.ts` and the module's own `utils.ts` first.
- Formatters are pure, null-safe and documented with a one-line comment when non-obvious.

## Backend (`src/_bff`)

Controller to service to (repository | processor | helper). Full layout in `docs/tech-specs/architecture.md`.

- **Controller** (`controllers/<name>.controller.ts`): thin tRPC binding with a zod input, `runEffect(...)` and an exhaustive `Match.tag` error map. One file per route exporting exactly one constant `<NAME>_PROTECTED_CONTROLLER` or `<NAME>_PUBLIC_CONTROLLER`. No business logic, no Supabase access.
- **Service** (`services/<name>.service.ts`): exported `Effect.fn('name')` function on Effect v4. Creates the Supabase client (publishable or service-role key) and passes it to repositories.
- **Repository** (`repositories/<table>.repository.ts`): exported `Effect.fn` functions, one file per table, never imported across modules. First parameters are `supabase` then `userId`. Every query filters by `user_id` and every insert sets it, even when RLS also enforces it. Check both the `Effect.tryPromise` catch and the returned `error`.
- **Router** (`<module>.router.ts`): the only files that `import 'server-only'`. `src/_bff/trpc/router.ts` composes module routers by namespace.
- **Errors**: `Data.TaggedError` classes in `src/_bff/lib/errors.ts`, each with `cause: unknown` and `error_hash: ErrorCode`. Codes live in `src/_bff/lib/error-codes.ts`.
- Use `return yield*` when failing. Never use try/catch inside `Effect.gen`.
- `protectedProcedure` guarantees `ctx.user`. Never map `UnauthenticatedError` or `GetUserError` in a controller `Match`.
- Cross-module imports only through `services/` or `processors/`.
- Effect v4 translations: `Effect.catchAll` / `Effect.orElse` become `Effect.catch`, `Effect.catchAllCause` becomes `Effect.catchCause`, `Effect.fork` becomes `Effect.forkChild`, `Effect.zipRight` becomes `Effect.andThen`, `Either` / `Effect.either` become `Result` / `Effect.result`. `Cause` is a flat `cause.reasons` array.

## Database and auth

- Every Supabase client is created with `db: { schema: 'roxcoach' }`. Nothing is created in the `public` schema (the Supabase project is shared with another app).
- Access flag is exactly `app_metadata.roxcoach === true` (strict boolean).
- Login failure shows one generic message for a wrong password and for an account without the flag: "Invalid email or password".
- Secrets, tokens and passwords never reach logs or error payloads.
- Read `docs/tech-specs/database.md` and `docs/tech-specs/auth-security.md` before touching schema, RLS or auth.

## Env

Variables are declared and validated in `src/env/server.ts` and `src/env/client.ts` with `@t3-oss/env-nextjs`. Never read `process.env` elsewhere. Add every new variable to `.env.example` and to the table in `docs/tech-specs/architecture.md`.

## Frontend

### Props: ALWAYS a named `type Props`

```tsx
type Props = { title: string }

export function Card({ title }: Props) {}
```

### Styling

- Merge classes with `cn()` from `@/lib/utils`, never template literals or concatenation.
- Use semantic tokens (`text-primary-foreground`, `bg-primary`, `text-muted-foreground`), never `text-white`, `bg-black`, `text-gray-*`.

### Next.js page and layout props

Use only the generated helpers, never hand-written `params` / `searchParams` types. The string is the route path relative to `src/app/`, without the filename.

```tsx
type Props = PageProps<'/dashboard/[id]'>
type Props = LayoutProps<'/dashboard'>
```

### Dialogs and drawers: ALWAYS the shared components

- To confirm an action (delete, cancel, disconnect, a short yes/no or a one-field prompt) use `ConfirmDialog` (`src/components/ui/confirm-dialog.tsx`). It is a popup on desktop and the `DrawerFormLayout` drawer on mobile. Pass `form` when it holds a field.
- For forms in a drawer use `DrawerFormLayout` (`src/components/ui/drawer-form-layout.tsx`) inside `Drawer` + `DrawerContent`.
- NEVER compose the base `Dialog*` or `Drawer*` primitives directly in a module to build a new dialog or sheet. If neither shared component fits, extend it instead of bypassing it. The only code that may use the primitives is `src/components/ui/` itself.

### Forms (react-hook-form + shadcn)

Logic lives in a hook, UI in the component.

- Hook file `use-<name>.ts`, colocated with the component. The zod schema and `FormValues` type live in the hook file.
- Use `zodResolver` with `useForm<FormValues>`.
- The component uses the shadcn `Form` with `FormField` + `FormControl` + `FormMessage`, never raw inputs outside that pattern.
- Select with react-hook-form: `value={field.value}` and `onValueChange={field.onChange}`.

## Lyfta

`mocks/lyfta_mock.json` is a real response of `GET /workouts` from the Lyfta personal API (personal
data anonymized). It is the source of truth for the payload shape.

- Before touching anything in the Lyfta integration (`src/_bff/modules/lyfta`, the Lyfta import in
  the `training` module, `docs/tech-specs/lyfta.md`), read this mock first.
- Before using a Lyfta field that is not imported yet, check that it exists in the mock and how it
  looks (types, string numbers, empty strings, comma separated lists). Never invent or assume a
  field. If it is not in the mock, ask the user for a real sample instead of guessing.
- When a real payload shows something the mock does not (a new field or format), update the mock
  in the same change and document the finding in `docs/tech-specs/lyfta.md`.

## Zepp

`mocks/zepp_history_mock.json` and `mocks/zepp_detail_mock.json` are real responses of the Zepp
(Amazfit) cloud API, anonymized. The API is not public, so they are the source of truth for the
payload shape.

- Before touching anything in the Zepp integration (`src/_bff/modules/zepp`, the Zepp import in the
  `training` module, `docs/tech-specs/zepp.md`), read both mocks first.
- Never invent or assume a field. If a field or workout type is not in a mock, ask the user for a
  real sample instead of guessing.
- When a real payload shows something the mock does not, update the mock in the same change and
  document the finding in `docs/tech-specs/zepp.md`.

## Tests

- Unit tests (`pnpm test`, vite-plus) cover pure logic and services with a fake Supabase client. Knip treats test files as usage.
- Every element used in tests carries a `data-testid`. Locate by test id only: never by role, label, text, placeholder, CSS, tag or id. Verify copy with `getByTestId(...)` plus `toHaveText` / `toContainText`.
- Never mock modules in application tests when a fake dependency can be passed in.
