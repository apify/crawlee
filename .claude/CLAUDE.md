# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## General Rules

Keep changes minimal and scoped. Do not fix unrelated issues, touch unrelated files, or 'clean up' code outside the scope of the current task unless explicitly asked.

## Git Conventions

- Always use `chore:` prefix for non-functional commits (config changes, CI fixes, changelog edits). Only use `fix:` for actual bug fixes in source code. Only use `feat:` for new features.
- Use `--no-verify` flag with git push when husky/lint-staged hooks fail due to PATH issues in this environment.

## Pre-Commit Checks

Always run `yarn tsc-check-tests` (or the project's type-check command) before committing any TypeScript changes. Never assume type safety — verify it.

## Code Editing Rules

When reviewing or editing code, do NOT remove code (assertions, type casts, etc.) unless you have verified it's safe by running the build/type checker. Never claim code is 'redundant' without evidence.

## Testing

- When fixing bugs, write the test FIRST that reproduces the issue, then implement the fix. Do not implement fixes before having a failing test.
- In test files, never leave debug artifacts (console.log, debug mode flags, commented-out code). Clean up before committing.

## PRs

When opening PRs, write concise descriptions focused on what changed and why. Avoid boilerplate templates or overly verbose descriptions. Skip the "Test plan" section completely, don't state the obvious (e.g., tests pass or other stuff visible from the CI checks).

## Build & Test Commands

```bash
# Setup (uses Yarn v4 via Corepack)
corepack enable
yarn install

# Build
yarn build                    # Build all packages (Turbo + TypeScript)

# Test
yarn test                     # Run all tests (vitest)
yarn test:full                # Include difficult tests (CRAWLEE_DIFFICULT_TESTS=1)
yarn vitest run path/to/test.ts    # Run specific test file

# Code Quality
yarn lint                     # ESLint
yarn lint:fix                 # ESLint with auto-fix
yarn format                   # Format with Biome
yarn tsc-check-tests          # Type-check test files
```

## Architecture

Crawlee is a **Yarn workspaces monorepo** with Turbo build orchestration. All packages are in `/packages/`.

### Package Hierarchy

```
@crawlee/types          # Shared TypeScript interfaces
@crawlee/utils          # Shared utilities
@crawlee/memory-storage # In-memory storage (default for testing)
       ↓
@crawlee/core           # Request, RequestQueue, RequestList, Dataset
       ↓
@crawlee/basic          # BasicCrawler (foundation for all crawlers)
       ↓
@crawlee/http           # HttpCrawler
       ↓
┌──────┴──────┬─────────────┐
↓             ↓             ↓
@crawlee/cheerio  @crawlee/jsdom  @crawlee/linkedom
(HTML parsing variants)

@crawlee/browser-pool   # Browser instance management
       ↓
@crawlee/browser        # BrowserCrawler base
       ↓
┌──────┴──────┐
↓             ↓
@crawlee/playwright  @crawlee/puppeteer

crawlee                 # Meta-package re-exporting most @crawlee/* packages
```

### Test Location

Tests are in `/test/` at the repo root (not inside packages). E2E tests are in `/test/e2e/`.

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
