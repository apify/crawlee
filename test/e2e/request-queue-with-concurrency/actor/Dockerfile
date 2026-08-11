FROM apify/actor-node:24-beta

COPY packages ./packages
COPY package*.json ./

RUN rm -rf node_modules package-lock.json
RUN npm --quiet set progress=false \
	&& npm install --only=prod --no-audit \
	&& npm update --no-audit \
	&& echo "Installed NPM packages:" \
	&& (npm list --only=prod --all || true) \
	&& echo "Node.js version:" \
	&& node --version \
	&& echo "NPM version:" \
	&& npm --version

COPY . ./
