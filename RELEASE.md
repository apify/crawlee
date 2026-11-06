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

## Playbook: switching master to the next major

Notes from the v4 transition (August 2026), for whoever does v5. The overall flow: develop
the next major on a `vN` branch (canaries under the `vN` dist-tag, RCs under `rc`), and when
it is time to make it the main line, cut a maintenance branch and fast-forward master.

1. **Cut the maintenance branch first.** Branch `(N-1).x` off the master tip. In one commit,
   adapt its workflows: `test-ci.yml` triggers and the `release_next` gate point at the
   branch (use exact `github.ref == 'refs/heads/(N-1).x'` matching, not `contains()` — the
   substring match is a footgun), and delete the `version-docs` job from `release.yml`
   (it checks out the repo default branch, so on a maintenance branch it would snapshot the
   wrong docs). Canaries keep the `next` tag and stable releases keep `latest` until the new
   major actually ships.
2. **Rebase the `vN` branch onto the master tip** and validate: no conflict markers, tree
   diff vs the old `vN` tip only shows what you expect, full build, `tsc-check-tests`,
   `api:check`, test suite, website build. Watch for master-only features silently lost in
   the rebase — compare public API snapshots (`docs/public-api/`), and re-check any file
   both lines touched heavily.
3. **Docs.** Delete the dev snapshot (`website/versioned_docs/version-N.0`, its sidebars
   file, and the `versions.json` entry) — the dev docs become the unversioned "current"
   version, labeled via `versions.current.label` (`'N.0 (RC)'`) in `docusaurus.config.js`.
   The previous major stays the default docs version until the stable release, whose
   `version-docs` job creates the real `N.0` snapshot. Gotchas: the latest snapshot is
   served *unversioned* at `/js/api`, so hardcoded `/js/api/N-1.x/...` links (blog posts,
   snapshot edits from the dev branch) break once the dev snapshot is gone, and package
   READMEs that link to new-major API pages need `/js/api/next/...` until the major is the
   default. `ApiLink.jsx` and `NavbarItem/ComponentTypes.js` must both derive the stable
   version from `versions.json[0]`.
4. **Fast-forward push master.** A PR cannot do this: the org ruleset only allows squash
   merges into master, and a squash (or GitHub's rebase-merge) would rewrite the history.
   Direct pushes are blocked by three rulesets — org "Important branches PR enforcement",
   org "Allow only squash merges…" (its `pull_request` rule also enforces PR-only pushes),
   and repo "Require CI checks on master" — all of which accept the `BypassTemporary` team,
   so join it for the duration of the push (the last two needed the team added in the v4
   round; check they still have it).
5. **Retarget the open `vN`-based PRs to master yourself** (`gh pr edit --base master`)
   before deleting the `vN` branch. GitHub only auto-retargets when the base branch is
   deleted after being merged through a PR; after a fast-forward push, deleting the branch
   would auto-close them instead.
6. **Update the required status checks** on the "Require CI checks on master" ruleset if the
   Node matrix changed, and check Renovate/Dependabot: the dev branch's lockfile format wins
   after the merge, and dependency bumps that renovate landed on old-master meanwhile may
   need re-applying (a stale peer-keyed lockfile entry can surface as bogus type errors —
   `pnpm dedupe` fixes that).
7. **Open the release-day tracking issue** (see the v4.0.0 section above for the shape) and
   keep the dist-tag flips in it — the maintenance branch must move off `latest` the same
   day the new major claims it.
