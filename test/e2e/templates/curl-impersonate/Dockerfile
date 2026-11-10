FROM node:24 AS builder

COPY /packages ./packages
COPY /package*.json ./
RUN rm -rf node_modules package-lock.json
RUN npm --quiet set progress=false \
    && npm install --only=prod --no-audit

FROM lwthiker/curl-impersonate

COPY --from=builder /usr/local/bin /usr/local/bin
COPY --from=builder /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
# Wipe any preinstalled node_modules so the builder tree (with file: symlinks)
# can be copied over cleanly.
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

CMD npm run start
