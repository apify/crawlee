# Public API surface maps

Each `*.api.md` file in this folder is a generated **map of the public, type-level
interface** of one publishable `@crawlee/*` package — every exported class, method,
property, function, and type, with full signatures. These reports define **where we
promise backwards compatibility**.

They are produced by [API Extractor](https://api-extractor.com/) from the built
`dist/index.d.ts` of each package.

## What a tag means

These reports are an **inventory of backwards-compatibility promises**. Membership is the
promise; the tags are how a member joins or leaves it.

- **Untagged — promised.** In the report, and covered by backwards compatibility. The codebase
  does not use explicit `@public` tags, so untagged is the default and anything you add is
  promised unless you say otherwise.
- **`@internal` (and the legacy `@ignore`) — not promised.** Trimmed from the report. It is
  still exported, still present in the published `.d.ts`, and still has working
  auto-completion. You may use it; it may change or disappear in any release, including a
  patch.

**We deliberately do not strip these members from the `.d.ts`.** No `stripInternal`, no
parallel "internal build". Two reasons: crawlee's own packages consume plenty of each other's
internals, and an escape hatch that lets someone unblock themselves — knowingly, at their own
risk — is worth more than one we have taken away. So the tag is a statement about *support*,
not about *access*.

The practical consequence when reviewing: tagging something `@internal` does not make it
harder to reach, it only stops us owing anyone stability on it. Reach for `#private` or TS
`private` when a member genuinely should be unreachable, and for `@internal` when it should be
reachable but unsupported. Both are legitimate; they answer different questions.

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

- Mechanically, the reports are API Extractor's **`public`** variant, so `@internal`
  (`@alpha`/`@beta` too) is excluded. `@ignore` is a TypeDoc-era tag that API Extractor does
  not act on, so the generator rewrites it to `@internal` before extraction. It rewrites
  nothing else, which is worth knowing:
  **`@private` is inert here.** A member whose only tag is `@private` stays in the report and
  stays promised, so it is not a way to de-promise anything — use `@internal`.
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
  exclusions are passed as `--exclude` by the `api:check` / `api:extract` scripts in
  `package.json`.
- `crawlee.api.md` looks almost empty — eleven `export *` lines and no declarations — and that
  is correct rather than a gap. The meta-package re-exports; it declares nothing of its own.
  Everything it hands you belongs to a constituent package and is already inventoried there, so
  a break in any of it shows up in that package's report first. Only two kinds of change are
  meta-package-only, and this report catches both: dropping an `export *` line, and changing
  something the meta-package declares itself — the `utils` bag that used to live here was in
  the report, and its removal showed up as a diff. Listing the ~380 re-exported names instead
  would restate promises where they are not made and churn on every constituent change.

  The case that looks like a hole is not one. If two constituents ever export *different*
  symbols under the same name, TypeScript raises `TS2308` ("has already exported a member
  named …") in `packages/crawlee/src/index.ts`, so the build fails — the name does not quietly
  drop out of the barrel. Several hundred names are re-exported by more than one constituent
  today; every one of them is a single symbol reached by several paths, which is fine and
  raises nothing.
- The generator lives in its own repository,
  [`apify/api-extractor-report`](https://github.com/apify/api-extractor-report), and runs via
  `pnpm dlx` from the `api:check` / `api:extract` scripts — it is not vendored here, so its
  behaviour is pinned by that repository rather than by this one. It temporarily strips the
  build's injected `// @ts-ignore` comment lines from the `.d.ts` files (restoring them
  afterwards) because API Extractor's AST walker trips over some of them; a small number of
  packages additionally need a sanitized-mirror fallback.
- **The reports are an inventory of what we promise, not a measure of how much code is
  reachable.** A symbol is in a report because we have committed to not breaking it; a symbol
  is absent because we have not. Absent does *not* mean inaccessible, and making it
  inaccessible is explicitly not the goal — see "What a tag means" above. Shrinking a report
  is therefore only ever a *consequence* of deciding that something was never a promise, never
  a target in its own right. A change that removes entries without changing any decision has
  achieved nothing; a change that adds entries because we decided to support something is a
  success. Issue #3109 tracks that decision-making, not a line count.
