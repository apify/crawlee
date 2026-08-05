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

- `api:check` also fails if a report ends up referencing a symbol it never declares, which
  leaves the committed map describing a type nothing in it defines. Regenerating cannot fix
  that; it has to be fixed in the source. In practice it means a `@public` symbol's signature
  references an `@internal`/`@ignore`-d one, so the referenced type is trimmed out from under
  it. Either drop the referenced type's tag (it is reachable from the public API, so users can
  already depend on it) or keep it out of the public signature. An untagged symbol is
  implicitly public, which is the convention here — the codebase does not use explicit
  `@public` tags.

  A symbol that is merely missing from the package's exports does **not** need fixing: see the
  note on forgotten exports below.

## Notes

- The reports are generated as API Extractor's **`public`** variant, so symbols tagged
  `@internal` (`@alpha`/`@beta` too) are excluded — only `@public` surface is tracked.
  The legacy `@ignore` tag counts as `@internal` here; the generator rewrites it before
  extraction, so an `@ignore`-d symbol is excluded too and cannot be referenced from a
  `@public` signature.
  The generator stages the variant as `<name>.public.api.md` under `temp/` and promotes it
  onto the committed `<name>.api.md`, so the tracked filenames stay stable.
- API Extractor builds the import list before it trims the non-`@public` declarations and
  never revisits it, so a type reachable only from an `@internal` member would linger as a
  bare import and read as public surface. There is no config option for this, so the
  generator post-processes each report: it parses the fenced TypeScript and drops imports
  whose binding is referenced by no declaration that survived the trim.
- **Forgotten exports** — types the public API references but the entry point never exports —
  are included in the report via `includeForgottenExports` and carry an explicit banner:

  ```ts
  // Not exported by the entry point; reachable only as a referenced type.
  // @public (undocumented)
  interface SitemapUrlData {
  ```

  Their *shape* is part of the surface we promise not to break, but their *name* is not
  importable, so they are emitted without `export`. API Extractor labels them `@public
  (undocumented)` like anything else, which is indistinguishable from a real export at a
  glance, hence the added banner. The alternative was exporting every such type from its
  package — ~38 new public exports, committing us to names we never meant to publish. If you
  *want* one importable, export it deliberately and the report will show it with `export`.
- Because API Extractor decides both of the above before the `@public` trim, it also offers
  declarations for symbols reachable only from members that never reach the report. The
  generator drops those the same way it drops dead imports, so the report carries nothing it
  does not refer to. Only symbols flagged `ae-forgotten-export` are eligible, which is what
  keeps genuinely reachable declarations (e.g. the `social` namespace in `@crawlee/utils`,
  whose members are exposed through a `declare namespace` block) from being pruned.
- `docs/public-api/temp/` holds intermediate reports (including the staged `.public.api.md`
  files) and is git-ignored.
- `@crawlee/cli` and `@crawlee/templates` are deliberately excluded — they are tooling
  (a CLI binary and project scaffolding), not an importable API where we promise BC. The
  exclude list lives in `scripts/api-extractor/run.ts`.
- The generator lives in `scripts/api-extractor/`. It temporarily strips the build's
  injected `// @ts-ignore` comment lines from the `.d.ts` files (restoring them
  afterwards) because API Extractor's AST walker trips over some of them; a small number
  of packages additionally need a sanitized-mirror fallback. See the comments in
  `scripts/api-extractor/run.ts` for details.
- These reports now cover only the `@public` surface. Further shrinking them — genuinely
  hiding class internals (untagged `protected`/`_`-prefixed members) rather than merely
  tagging them — is the goal tracked in issue #3109.
