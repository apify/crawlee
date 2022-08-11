# First, specify the base Docker image. You can read more about
# the available images at https://crawlee.dev/docs/guides/docker-images
# You can also use any other image from Docker Hub.
FROM apify/actor-node:16 AS builder

# Second, copy the TS source files, package.json and package-lock.json since it should be
# the only files that affects the installation and build in the next step
COPY package*.json crawlee?json ./
COPY src ./src

# Install all dependencies (including dev deps) and build the project
RUN npm install --include=dev && npm run build

# Create final image
FROM apify/actor-node-puppeteer-chrome:16

# Copy only necessary files (crawlee.json might not exist, so we need the regexp trick with `crawlee?json`)
COPY --from=builder /usr/src/app/package.json /usr/src/app/crawlee?json ./
COPY --from=builder /usr/src/app/README.md ./
COPY --from=builder /usr/src/app/dist ./dist

# Install only prod deps
RUN npm --quiet set progress=false \
    && npm install --only=prod --no-optional \
    && echo "Installed NPM packages:" \
    && (npm list --only=prod --no-optional --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version

# Run compiled code
CMD ./start_xvfb_and_run_cmd.sh && npm run start:prod
