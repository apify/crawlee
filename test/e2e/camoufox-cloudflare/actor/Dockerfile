# The base image provides the Camoufox binary (Firefox 150); the actor pins the matching
# Playwright (1.60) in package.json. Camoufox-js 0.11 cannot run under Playwright 1.61.
FROM apify/actor-node-playwright-camoufox:24-1.60.0-beta

# The Camoufox base image builds as the non-root `myuser`, so everything we copy in must
# be chowned to it — otherwise `npm install`/`npm update` cannot write into the workspace
# packages (EACCES on packages/*/node_modules).
COPY --chown=myuser packages ./packages
COPY --chown=myuser package*.json ./

# `--ignore-scripts` skips the `camoufox-js fetch` postinstall; the browser is already
# baked into the base image.
RUN npm --quiet set progress=false \
    && npm install --only=prod --no-optional --no-audit --ignore-scripts \
    && npm update --no-audit \
    && echo "Installed NPM packages:" \
    && (npm list --only=prod --no-optional --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version

COPY --chown=myuser . ./
