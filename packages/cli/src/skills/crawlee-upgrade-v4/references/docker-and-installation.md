# Docker and installation

## Runtime images

Require Node.js 22.13+ in every build/runtime stage, including images selected through `ARG`, Compose or CI variables. `await using` requires Node.js 24+.

Preserve image family, distribution and browser tooling. Verify new tags and update pinned digests. Align Node declarations and CI setup. Install native dependencies for the container's OS, architecture and libc; do not copy incompatible host `node_modules`.

## Optional dependencies

Impit and filesystem binaries ship as optional dependencies. Remove exclusion settings from install/prune commands, configuration and environment variables:

| Package manager | Settings to remove |
| --- | --- |
| [npm](https://docs.npmjs.com/cli/v11/commands/npm-ci/#omit) | `--omit=optional`, `--no-optional`, `--optional=false`, `omit=optional`, `optional=false` |
| [pnpm](https://pnpm.io/cli/install#--no-optional) | `--no-optional` and equivalent configuration |
| [Yarn Classic](https://classic.yarnpkg.com/lang/en/docs/cli/install/#toc-yarn-install-ignore-optional) | `--ignore-optional` and `ignore-optional` configuration |
| [Bun](https://bun.com/docs/pm/cli/install) | `--omit=optional` / `--omit optional`, `[install] optional = false` |

Check Dockerfiles, scripts, CI, `.npmrc`, `.yarnrc`, `pnpm-workspace.yaml`, `bunfig.toml` and `NPM_CONFIG_OMIT`. For other package-manager versions, use their documented equivalent. Preserve flags that include optional dependencies and ensure target-architecture settings include the container.

Remove only optional omission; preserve dev omission and frozen-lockfile behavior:

```diff
-RUN npm ci --omit=dev --omit=optional
+RUN npm ci --omit=dev
```

## Verify

Build with the project's arguments and check `node --version` in the final image. Run an isolated-storage smoke test using the configured HTTP client and storage backend to catch missing native binaries. Verify browser launch when affected. Report unavailable container checks.
