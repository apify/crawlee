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

- `api:check` also fails if a `@public` symbol's signature references an `@internal` one.
  Regenerating cannot fix that — the referenced type is trimmed from the report, so the
  committed map is left referring to a symbol it never declares. Fix it in the source:
  either drop the referenced type's `@internal`/`@ignore` tag (it is reachable from the
  public API, so users can already depend on it) or keep it out of the public signature.
  An untagged symbol is implicitly public, which is the convention here — the codebase
  does not use explicit `@public` tags.

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
- Symbols referenced by the public API but never exported from the entry point
  (`ae-forgotten-export`) are reported as warnings only. They are the same kind of dangling
  reference, but there is a long tail of them and they are often deliberate.
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
