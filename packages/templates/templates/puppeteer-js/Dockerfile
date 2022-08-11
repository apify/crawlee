FROM apify/actor-node-puppeteer-chrome:16

# copy package.json, lock file and possibly crawlee.json
COPY package*.json crawlee?json ./
COPY src ./src

# install only prod deps
RUN npm --quiet set progress=false \
    && npm install --only=prod --no-optional \
    && echo "Installed NPM packages:" \
    && (npm list --only=prod --no-optional --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version
