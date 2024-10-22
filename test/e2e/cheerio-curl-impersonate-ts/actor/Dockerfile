FROM node:20 AS builder

COPY /packages ./packages
COPY /package*.json ./
COPY /tsconfig.json ./
COPY /main.ts ./
RUN npm --quiet set progress=false \
    && npm install --only=prod --no-optional --no-audit \
    && npm update \
    && npm run build

FROM apify/actor-node-playwright-chrome:20-beta

RUN rm -r node_modules
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
