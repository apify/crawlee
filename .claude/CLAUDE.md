# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## General Rules

Keep changes minimal and scoped. Do not fix unrelated issues, touch unrelated files, or 'clean up' code outside the scope of the current task unless explicitly asked.

## Git Conventions

- Always use `chore:` prefix for non-functional commits (config changes, CI fixes, changelog edits). Only use `fix:` for actual bug fixes in source code. Only use `feat:` for new features.
- Use `--no-verify` flag with git push when husky/lint-staged hooks fail due to PATH issues in this environment.

## Pre-Commit Checks

Always run `pnpm tsc-check-tests` (or the project's type-check command) before committing any TypeScript changes. Never assume type safety — verify it.

## Code Editing Rules

When reviewing or editing code, do NOT remove code (assertions, type casts, etc.) unless you have verified it's safe by running the build/type checker. Never claim code is 'redundant' without evidence.

## Testing

- When fixing bugs, write the test FIRST that reproduces the issue, then implement the fix. Do not implement fixes before having a failing test.
- In test files, never leave debug artifacts (console.log, debug mode flags, commented-out code). Clean up before committing.

## PRs

When opening PRs, write concise descriptions focused on what changed and why. Avoid boilerplate templates or overly verbose descriptions. Skip the "Test plan" section completely, don't state the obvious (e.g., tests pass or other stuff visible from the CI checks).

## Build & Test Commands

```bash
# Setup (pnpm via Corepack)
corepack enable
pnpm install

# Build
pnpm build                    # Build all packages (Turbo + TypeScript)

# Test
pnpm test                     # Run all tests (vitest), fast config
pnpm test:full                # Difficult tests + full firefox/webkit plugin matrix
pnpm vitest run path/to/test.ts    # Run specific test file

# Code Quality
pnpm lint                     # oxlint
pnpm lint:fix                 # oxlint with auto-fix
pnpm format                   # Format with oxfmt
pnpm tsc-check-tests          # Type-check test files
```

## Architecture

Crawlee is a **pnpm workspaces monorepo** with Turbo build orchestration. All packages are in `/packages/`.

### Package Hierarchy

```
@crawlee/types          # Shared TypeScript interfaces
@crawlee/utils          # Shared utilities
@crawlee/fs-storage     # File-system storage backend (in-memory backend lives in @crawlee/core)
       ↓
@crawlee/core           # Request, RequestQueue, RequestList, Dataset
       ↓
@crawlee/basic          # BasicCrawler (foundation for all crawlers)
       ↓
@crawlee/http           # HttpCrawler
       ↓
@crawlee/cheerio
(@crawlee/jsdom and @crawlee/linkedom moved to their own repositories)

@crawlee/browser-pool   # Browser instance management
       ↓
@crawlee/browser        # BrowserCrawler base
       ↓
┌──────┴──────┬────────────────────┐
↓             ↓                    ↓
@crawlee/playwright  @crawlee/puppeteer  @crawlee/stagehand   # stagehand: AI-driven browser crawler

@crawlee/http-client    # Pluggable HTTP client interface
       ↓
┌──────┴──────┐
↓             ↓
@crawlee/impit-client  @crawlee/got-scraping-client

@crawlee/otel           # OpenTelemetry instrumentation

@crawlee/templates      # Project templates
       ↓
@crawlee/cli            # `crawlee` CLI (create/run projects, install Playwright browsers)

crawlee                 # Meta-package re-exporting most @crawlee/* packages
```

### Test Location

Most tests are in `/test/` at the repo root; some packages also have their own `packages/*/test/`. E2E tests are in `/test/e2e/`. `tsc-check-tests` only type-checks `/test/`, not `packages/*/test/`.

## Vitest Notes (vs Jest)

- Mocks are per-test-file (no need for `afterAll` unmocking)
- Use `vitest.mock()` and `vitest.mocked()` for type casting
- Module mocking must match import style (default vs named exports)
- Spies are separate instances - reuse the same spy for multiple operations
- `vitest.setConfig()` for runtime configuration changes
- Avoid importing `const enum` from external packages (won't inline like tsc)

## macOS Setup for Proxy Tests

```bash
sudo ifconfig lo0 alias 127.0.0.2 up
sudo ifconfig lo0 alias 127.0.0.3 up
sudo ifconfig lo0 alias 127.0.0.4 up
```
