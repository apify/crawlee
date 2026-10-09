---
name: crawlee-upgrade
description: Plan and perform a Crawlee upgrade using the bundled migration guides, completing one major version at a time.
---

# Crawlee upgrade plan: v{FROM_MAJOR} to v{TO_MAJOR}

Inspect this project and confirm its Crawlee versions before changing files. The guides below link local files; if they are unreadable from here, run `npx crawlee@4 upgrade --export <dir>` with a readable directory and use the prompt it prints instead. The CLI selected v{FROM_MAJOR} as the starting major from the project or an explicit `--from` override. If that does not match the code and dependencies, resolve the discrepancy with the user.

## Migration sequence

{MIGRATION_PLAN}

Apply the guides below in this order. Complete each major upgrade, install compatible dependencies, and run its verification before starting the next. Do not jump directly to the final major or mix changes from different steps. If a step fails verification, fix it or report the blocker before proceeding.

Follow the Git permission and incremental-commit instructions in the guides. One approval covers the full sequence; commit each coherent, verified change before continuing. Preserve user edits and data throughout the migration.

## Migration guides

{MIGRATION_GUIDES}
