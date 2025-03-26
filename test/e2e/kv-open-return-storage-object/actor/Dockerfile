FROM apify/actor-node:20-beta

COPY packages ./packages
COPY package*.json ./

RUN npm --quiet set progress=false \
	&& npm install --only=prod --no-optional --no-audit \
	&& npm update --no-audit \
	&& echo "Installed NPM packages:" \
	&& (npm list --only=prod --no-optional --all || true) \
	&& echo "Node.js version:" \
	&& node --version \
	&& echo "NPM version:" \
	&& npm --version

COPY . ./
