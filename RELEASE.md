# How Crawlee releases work

Releases are managed by GitHub Actions and lerna. There are two release lines:

| line | branch | stable dist-tag | canary dist-tag |
|---|---|---|---|
| v4 (current development) | `master` | `latest` (from 4.0.0 on) | `v4` now, `next` once 4.0.0 is stable |
| v3 (maintenance) | `3.x` | `latest` until 4.0.0 ships, then `latest-v3` | `next` now, `next-v3` once 4.0.0 is stable |

Release candidates for the next major are published from `master` under the `rc` dist-tag.

## Canary releases

Every push to `master` or `3.x` (that is not a docs change and does not say `[skip ci]`)
triggers the `release_next` job in `test-ci.yml`. It builds the packages, derives a canary
version from `lerna.json` (`scripts/copy.ts --canary`) and invokes `publish-to-npm.yml`,
which publishes all packages under the branch's canary dist-tag (see the table above; the
tag is hardcoded in the branch's `publish:next` script in `package.json`). No commit or git
tag is created for canaries.

## Stable releases

Trigger the `Release @latest` workflow (`release.yml`) manually via `workflow_dispatch`
**from the branch you want to release**:

- `master` + `bump: major` is how `4.0.0` goes out (lerna bumps `3.18.x` → `4.0.0`,
  publishes to `latest`).
- `3.x` + `bump: patch`/`minor` ships v3 maintenance releases.

The workflow runs the tests, bumps versions via `lerna version` (conventional-commits
changelog, GitHub release, git tag), pins internal dependency versions, publishes through
`publish-to-npm.yml` with `dist-tag: prod`, and triggers Apify Docker image builds.

On minor/major releases from `master`, the `version-docs` job snapshots the current docs
into `website/versioned_docs` (Docusaurus `docs:version` + `api:version`). The job never
runs for maintenance branches — 3.x docs live in the `version-3.18` snapshot on `master`.

## RC releases

Dispatch `publish-to-npm.yml` from `master` with `dist-tag: rc`. This publishes
`4.0.0-rc.N` under the `rc` dist-tag and pushes a `v4.0.0-rc.N` git tag pointing at the
released commit; no version-bump commit lands on the branch.

## v4.0.0 release day

See the tracking issue for the ordered checklist (publish 4.0.0 to `latest`, switch
master canaries `v4` → `next` and `--canary=major` → `--canary=patch`, switch 3.x to
`latest-v3`/`next-v3`, drop the RC docs label).
