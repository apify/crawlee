FROM apify/actor-node:16 AS builder

COPY . ./
RUN npm install --include=dev && npm run build

FROM apify/actor-node:16

COPY --from=builder /usr/src/app/packages ./packages
COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/main.js ./

RUN npm --quiet set progress=false \
    && npm install --only=prod --no-optional \
    && echo "Installed NPM packages:" \
    && (npm list --only=prod --no-optional --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version

CMD npm run start:prod
