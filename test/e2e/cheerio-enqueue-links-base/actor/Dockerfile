FROM apify/actor-node:18-beta

COPY packages ./packages
COPY package*.json ./

RUN npm --quiet set progress=false \
	&& npm install --only=prod --no-optional \
	&& npm update \
	&& echo "Installed NPM packages:" \
	&& (npm list --only=prod --no-optional --all || true) \
	&& echo "Node.js version:" \
	&& node --version \
	&& echo "NPM version:" \
	&& npm --version

COPY . ./
