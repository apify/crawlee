FROM node:24 AS builder

COPY /packages ./packages
COPY /package*.json ./
RUN rm -rf node_modules package-lock.json
RUN npm --quiet set progress=false \
    && npm install --only=prod --no-audit \
    && npm update

FROM apify/actor-node-playwright-chrome:24-1.58.2-beta

# The browser base images ship a preinstalled node_modules - wipe it so the
# builder tree (with file: symlinks) can be copied over cleanly.
RUN rm -rf node_modules
COPY --from=builder /node_modules ./node_modules
COPY --from=builder /packages ./packages
COPY --from=builder /package*.json ./
COPY /.actor ./.actor
COPY /main.js ./

RUN echo "Installed NPM packages:" \
    && (npm list --only=prod --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version

ENV PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/google-chrome
