---
name: crawlee-upgrade-v4
description: Migrate a JavaScript or TypeScript Crawlee project from v3 to v4 while preserving crawl behavior and persistence.
---

# Upgrade Crawlee from v3 to v4

Inspect, plan, migrate and verify this project. The breaking changes are described in the bundled copy of the [v4 upgrade guide](<{SKILL_ROOT}/guide/upgrading-v4.md>), which is the same text as the [published guide](https://crawlee.dev/js/docs/next/upgrading/upgrading-to-v4).

## Read the guide

Read the guide's rename cheat sheet and all of "Changes most users will hit" before planning. Each "Only if you…" section applies only when the project uses what its title names; most of them summarize a detail page, so read that page when the section applies:

| Project usage or migration error | Detail page |
| --- | --- |
| Crawler subclasses, protected overrides, private fields, explicit generics, hook types, `RecoverableState` | [Internals](<{SKILL_ROOT}/guide/internals.md>) |
| `SessionPool`, `Session`, `createSessionFunction`, proxy tiers, `newUrlFunction` | [Sessions and proxies](<{SKILL_ROOT}/guide/sessions-and-proxies.md>) |
| `browserPoolOptions`, `browserController`, `launchContext`, rendering type predictor | [Browser management](<{SKILL_ROOT}/guide/browser-management.md>) |
| `statisticsOptions`, custom `Statistics`, persisted counters | [Statistics](<{SKILL_ROOT}/guide/statistics.md>) |
| `gotScraping`, `BaseHttpClient`, custom HTTP clients | [HTTP clients](<{SKILL_ROOT}/guide/http-clients.md>) |
| `RequestList`, sitemap loaders, custom request managers, per-domain throttling | [Request loaders](<{SKILL_ROOT}/guide/request-loaders.md>) |
| `StorageClient`, custom storage backends, `RequestQueue` or `Dataset` internals | [Storage backends](<{SKILL_ROOT}/guide/storage-backends.md>) |
| `autoscaledPoolOptions`, `crawler.autoscaledPool`, snapshotting, load signals | [Autoscaling](<{SKILL_ROOT}/guide/autoscaling.md>) |
| Imports from `@crawlee/utils` or `@crawlee/types` | [Utils and types](<{SKILL_ROOT}/guide/utils-and-types.md>) |
| An import the compiler no longer finds | [Removed symbols](<{SKILL_ROOT}/guide/removed-symbols.md>) |

Skip the guide's "Upgrade with an AI coding tool" section: it describes the command that printed this prompt.

## Inspect and plan

Inspect manifests, lockfiles, crawler code, tests, runtime versions, CI and Dockerfiles. Inventory `crawlee`, `@crawlee/*`, `apify`, `apify-*` and `@apify/*` across workspace dependency sections. Update the Crawlee packages together to compatible v4 releases and refresh the lockfile. Actor projects also move to `apify@4`; other Apify packages version independently, so update them only when compatibility requires it.

Search the project for what the guide's sections name. Plan the changes around the project's crawler types, custom collaborators, storage persistence and queue reuse. Ask about behavior the code does not establish. If the project is already on v4, address the remaining migration gaps.

Apply the Node.js and optional-dependency requirements everywhere the project sets them: every Dockerfile build and runtime stage, base images selected through `ARG`, Compose or CI variables, install and prune scripts, and package-manager configuration. Preserve the image family, browser support, dev-dependency omission and frozen-lockfile behavior.

## Git

For a Git project, inspect the branch and working tree. Ask once for permission to create a migration branch and make incremental commits, unless both are already authorized. Wait for approval before those Git actions.

If approved, verify and commit each coherent step before continuing. Stage only migration changes; preserve existing edits and ask about overlaps. Do not push unless asked. If branching or commits are declined, continue the migration without them.

## Verify

Run the project's type check, relevant tests and build. Use fixtures or a bounded crawl with isolated storage to check affected behavior, including that native HTTP and filesystem binaries load in the target container. Do not purge user storage or run a production crawl as verification. Report changes, failed or unavailable checks, and unresolved decisions.
