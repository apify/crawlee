FROM node:16 AS builder

COPY /packages ./packages
COPY /package*.json ./
RUN npm --quiet set progress=false \
    && npm install --only=prod --no-optional

FROM apify/actor-node-playwright-chrome:16

RUN rm -r node_modules
COPY --from=builder /node_modules ./node_modules
COPY --from=builder /packages ./packages
COPY --from=builder /package*.json ./
COPY /apify.json ./
COPY /main.js ./

RUN echo "Installed NPM packages:" \
    && (npm list --only=prod --no-optional --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version
