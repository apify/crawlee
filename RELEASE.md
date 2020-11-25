# How to release new versions of Apify SDK
Release of new versions is managed by GitHub Actions. On pushes to the `master` branch, prerelease versions
are automatically produced. Latest releases are triggered manually through the GitHub release tool.
After creating a release there, Actions will automatically produce a latest version of the package.

## TLDR;
- To **NOT** release anything on a push to `master`, add `[skip ci]` to your commit message.
- To release `beta`, just push to `master`. If it breaks with a `Version already exists error` increment version
  in `package.json` and push again.
- To release `latest`, go to releases on GitHub, draft and publish a release. If you don't know how, read below.

## Prerelease (beta) versions
On each push to the `master` branch, a new prerelease version is automatically built and published
by GitHub Actions. To skip the process, add `[skip ci]` to your commit message.

### Release process
1. Actions build is triggered by a push to `master` (typically a merge of a PR).
2. Actions lint the source code and run tests in Node.js 10, 12 and 14.
3. If all is well, a new prerelease version is published to NPM (`${VERSION}-beta.${COUNTER}`),
   where `VERSION` is the version in package.json and `COUNTER` is a zero based index of existing prereleases.
   Example: `0.15.1-beta.3`.
4. The package is tagged with the `beta` NPM tag and a Git tag is associated with the triggering commit.
5. A build of Apify docker images is triggered that updates the `beta` packages to use the newly published package.
6. All done and ready to use.

### Updating a release version
When releasing breaking changes, new features or for any other reason that requires a version bump,
manually increment the version in the `package.json` file. Such as from `0.14.15` to `0.15.0`.
This will automatically trigger a prerelease build with the `0.15.0-beta.0` version.

### Existing versions
Actions will not allow you to publish a prerelease of a version that's already published. For example,
if version `0.14.15` already exists on NPM, you can no longer release a `0.14.15-beta.0` version.

## Latest release
To trigger a latest release, go to the GitHub release tool (select `releases` under `<> Code`).
There, draft a new release, fill the form (see below) and hit `Publish release`.
Actions will automatically release the latest version of the package.

### How to fill the form
- The version tag should be in the format `v${VERSION}` where `VERSION` is the version from `package.json`.
  Such as `v0.15.0` or `v0.16.17`.
- The target will typically be `master`, but you can also release any previous commit by selecting it or searching
  for it by ID. This is useful when there have been some changes in master from the latest prerelease and you'd
  like to release an older prerelease version as latest. You can find the commit ID easily by searching for the
  prerelease tag.
- The title should be the same as the version tag.
- Typically just adding changelog to the release would be fine, but feel free to add extra information.

### Release process
Similarly to the prerelease, the latest release process:
1. Triggers build, lints, runs tests.
2. Publishes new package to NPM with the `latest` tag and the version from package.json. Such as `0.15.1`.
3. A build and deploy of Apify docker images is triggered with the `latest` tag.
