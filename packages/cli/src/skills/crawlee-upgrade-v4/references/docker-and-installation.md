# Docker and installation

## Node.js images

Crawlee v4 requires Node.js 22.13+. Inspect every Dockerfile and every Node-based build or runtime stage, including images selected through `ARG`, Compose or CI variables. Bump older versions in both stages, including Node 22 images pinned below 22.13. Keep already compatible versions unless another migration change requires a bump. `await using` requires Node.js 24+.

Preserve the existing image family, distribution variant and browser tooling. For example, a Node 20 Debian slim image can move to its Node 22 counterpart. An Apify Playwright or Puppeteer image needs a compatible version of that browser image, rather than a generic Node image. Check that the chosen tag exists and has the required Node and browser versions. Update pinned digests to match the chosen image instead of retaining an old image digest with a new tag.

Align relevant project runtime declarations, CI Node setup and Docker build arguments. Install native dependencies for the target OS, architecture and libc. Do not copy host-installed node_modules into a different target platform.

## Optional dependencies must be installed

Impit and the native filesystem backend distribute platform binaries through optional dependencies. Remove options that exclude those dependencies from install, clean-install and prune commands wherever they occur, including Dockerfiles, package scripts, CI and deployment scripts.

| Package manager | Settings to remove |
| --- | --- |
| [npm](https://docs.npmjs.com/cli/v11/commands/npm-ci/#omit) | `--omit=optional`, legacy `--no-optional` / `--optional=false`, and equivalent `omit=optional` or `optional=false` configuration. |
| [pnpm](https://pnpm.io/cli/install#--no-optional) | `--no-optional` and equivalent configuration disabling optional dependencies. |
| [Yarn Classic](https://classic.yarnpkg.com/lang/en/docs/cli/install/#toc-yarn-install-ignore-optional) | `--ignore-optional` and equivalent `ignore-optional` configuration. |
| [Bun](https://bun.com/docs/pm/cli/install) | `--omit=optional` / `--omit optional`, and `[install] optional = false` in bunfig.toml. |

Check effective settings from configuration files and environment variables as well as command-line flags. Examples include `.npmrc`, `.yarnrc`, `pnpm-workspace.yaml`, `bunfig.toml`, and `NPM_CONFIG_OMIT=optional`. If an omit list contains both dev and optional, remove only optional.

For modern Yarn or another package manager, check the project's installed version and its documented settings rather than adding a flag from a different version. Preserve optional-dependency installation and ensure any configured target architectures include the container platform.

Keep options that include optional dependencies. Keep production-only dev omission, such as `npm ci --omit=dev` or `pnpm install --prod`, where intended. Preserve the package manager, lockfile and existing frozen-install policy. For example:

```diff
-RUN npm ci --omit=dev --omit=optional
+RUN npm ci --omit=dev
```

## Verify the container

When Docker is available, build the affected image using the project's build arguments and check `node --version` inside the final image. Run a bounded smoke test there using isolated storage and the project's configured HTTP client and storage backend. This should catch missing native binaries in the runtime layer as well as an outdated Node image. If a browser crawler changed, verify the required browser can launch. If the image cannot be built or run in the available environment, report that verification gap.
