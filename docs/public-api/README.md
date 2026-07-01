# Public API surface maps

Each `*.api.md` file in this folder is a generated **map of the public, type-level
interface** of one publishable `@crawlee/*` package — every exported class, method,
property, function, and type, with full signatures. These reports define **where we
promise backwards compatibility**.

They are produced by [API Extractor](https://api-extractor.com/) from the built
`dist/index.d.ts` of each package.

## Workflow

- After changing any package's public surface, regenerate the reports and commit them:

  ```sh
  pnpm build        # the reports are generated from dist/
  pnpm api:extract
  ```

- CI runs `pnpm api:check`, which fails if a committed report is out of date. A failing
  check means you changed the public API: either that change is intentional (commit the
  updated report — reviewers will see the surface diff) or it was accidental (fix it).

## Notes

- `docs/public-api/temp/` holds intermediate reports and is git-ignored.
- `@crawlee/cli` and `@crawlee/templates` are deliberately excluded — they are tooling
  (a CLI binary and project scaffolding), not an importable API where we promise BC. The
  exclude list lives in `scripts/api-extractor/run.ts`.
- The generator lives in `scripts/api-extractor/`. It temporarily strips the build's
  injected `// @ts-ignore` comment lines from the `.d.ts` files (restoring them
  afterwards) because API Extractor's AST walker trips over some of them; a small number
  of packages additionally need a sanitized-mirror fallback. See the comments in
  `scripts/api-extractor/run.ts` for details.
- Symbols tagged `@internal` still show up here if they are exported. Shrinking these
  reports (hiding internals, e.g. via `@internal` + a trimmed rollup, or by not exporting
  them at all) is the goal tracked in issue #3109.
