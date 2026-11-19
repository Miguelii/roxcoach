# Vendored anti-slop Oxlint plugins

## Source identity

- **Source:** the `install-anti-slop` agent skill bundle (`assets/anti-slop/`), installed with its `scripts/install.mjs` on 2026-11-19.
- **Upstream repository and commit:** unknown. The skill bundle is not a Git checkout and names no upstream repository.
- **Snapshot digest:** `eb5b28b0d59a8addec0f0027a63aab2a108e2bb506bcb77413fdb674c2598525` (SHA-256 over `shasum -a 256` of every bundle file, sorted by path with `LC_ALL=C`, excluding this `UPSTREAM.md`).
- **Recoverable pristine base:** the commit that first adds this directory. The copy was byte-identical to the bundle at install time (`diff -r` clean).

The nested `vendor/eslint-stylistic/UPSTREAM.md` and `LICENSE` record the separately vendored ESLint Stylistic rule and travel with this copy.

## Installed plugins

| Plugin name | Entry point |
| --- | --- |
| `anti-slop` | `tools/oxlint/anti-slop/index.ts` |
| `anti-slop-effect` | `tools/oxlint/anti-slop/effect/index.ts` (enabled because `effect` is a direct dependency) |

## Intentional local deviations

None.
