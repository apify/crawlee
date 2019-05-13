FROM apify/actor-node-chrome

# Copy source code
COPY . ./

# Install default dependencies, print versions of everything
RUN npm --quiet set progress=false \
 && npm install --only=prod --no-optional \
 && echo "Installed NPM packages:" \
 && npm list \
 && echo "Node.js version:" \
 && node --version \
 && echo "NPM version:" \
 && npm --version

# By default, the apify/actor-node-chrome image uses "npm start" to run the code.
# You can override this behavior using the CMD instruction here:
# CMD [ "npm", "start" ]
