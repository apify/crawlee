FROM node:22 AS builder

COPY /packages ./packages
COPY /package*.json ./
COPY /tsconfig.json ./
COPY /main.ts ./
RUN npm --quiet set progress=false \
    && npm install --only=prod --no-optional --no-audit \
    && npm update \
    && npm run build

FROM lwthiker/curl-impersonate

COPY --from=builder /usr/local/bin /usr/local/bin
COPY --from=builder /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
COPY --from=builder /node_modules ./node_modules
COPY --from=builder /packages ./packages
COPY --from=builder /package*.json ./
COPY --from=builder /main.js ./
COPY /.actor ./.actor

RUN echo "Installed NPM packages:" \
    && (npm list --only=prod --no-optional --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version

# run compiled code
CMD npm run start:prod
