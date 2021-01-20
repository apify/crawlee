---
id: docker-images
title: Running in Docker
---

Running headless browsers in Docker requires a lot of setup to do it right. But you don't need to
worry about that, because we already did it for you and created base images that you can freely use.
We use them every day on the [Apify Platform](../guides/apify_platform.md).

All images can be found in their [GitHub repo](https://github.com/apify/apify-actor-docker)
and in our [DockerHub](https://hub.docker.com/orgs/apify).

## Overview
Browsers are pretty big, so we try to provide a wide variety of images to suit your needs. Here's a full list
of our Docker images.

- [`apify/actor-node-basic`](#actor-node-basic)
- [`apify/actor-node-chrome`](#actor-node-chrome)
- [`apify/actor-node-chrome-xvfb`](#actor-node-chrome-xvfb)
- [`apify/actor-node-playwright`](#actor-node-playwright)
- [`apify/actor-node-playwright-chrome`](#actor-node-playwright-chrome)
- [`apify/actor-node-playwright-firefox`](#actor-node-playwright-firefox)

## Example Dockerfile
To use our images, you need a [`Dockerfile`](https://docs.docker.com/engine/reference/builder/).
You can either use this example, or bootstrap your projects with the [Apify CLI](../guides/getting_started.md#creating-a-new-project)
which automatically copies the correct Dockerfile into your project folder.

```dockerfile
# First, specify the base Docker image. You can read more about
# the available images at https://sdk.apify.com/docs/guides/docker-images
# You can also use any other image from Docker Hub.
FROM apify/actor-node-basic

# Second, copy just package.json and package-lock.json since it should be
# the only file that affects "npm install" in the next step, to speed up the build
COPY package*.json ./

# Install NPM packages, skip optional and development dependencies to
# keep the image small. Avoid logging too much and print the dependency
# tree for debugging
RUN npm --quiet set progress=false \
 && npm install --only=prod --no-optional \
 && echo "Installed NPM packages:" \
 && (npm list || true) \
 && echo "Node.js version:" \
 && node --version \
 && echo "NPM version:" \
 && npm --version

# Next, copy the remaining files and directories with the source code.
# Since we do this after NPM install, quick build will be really fast
# for most source file changes.
COPY . ./

# Optionally, specify how to launch the source code of your actor.
# By default, Apify's base Docker images define the CMD instruction
# that runs the Node.js source code using the command specified
# in the "scripts.start" section of the package.json file.
# In short, the instruction looks something like this:
#
# CMD npm start
```

## actor-node-basic
This is the smallest image we have based on Alpine Linux. It does not include any browsers, and it's therefore
best used with [`CheerioCrawler`](../api/cheerio-crawler). It benefits from lightning fast builds and container startups.

[`PuppeteerCrawler`](../api/puppeteer-crawler), [`PlaywrightCrawler`](../api/playwright-crawler)
and other browser based features will **NOT** work with this image.

```dockerfile
FROM apify/actor-node-basic
```

## actor-node-chrome
This image includes Puppeteer (Chromium) and the `Chrome` browser. It can be used with
[`CheerioCrawler`](../api/cheerio-crawler) and [`PuppeteerCrawler`](../api/puppeteer-crawler), but **NOT** with
[`PlaywrightCrawler`](../api/playwright-crawler). If you prefer Puppeteer, you'll save some time and megabytes
by selecting this image.

It can only run `headless` browsers. For headful, see [`actor-node-chrome-xvfb`](#actor-node-chrome-xvfb).

```dockerfile
FROM apify/actor-node-chrome
```

## actor-node-chrome-xvfb
The [`actor-node-chrome`](#actor-node-chrome) image with XVFB installed (a display emulator). It allows
you to run browsers with `headful: false`.

```dockerfile
FROM apify/actor-node-chrome-xvfb
```

## actor-node-playwright
A very large and slow image that can run everything. Puppeteer, Playwright, Chromium, Chrome, Firefox,
WebKit. Everything is installed. If you need to develop or test with multiple browsers, this is the image to choose,
but in most cases, we suggest using the specialized images below.

```dockerfile
FROM apify/actor-node-playwright
```

## actor-node-playwright-chrome
Similar to [`actor-node-chrome`](#actor-node-chrome), but for Playwright. You can run
[`CheerioCrawler`](../api/cheerio-crawler) and [`PlaywrightCrawler`](../api/playwright-crawler),
but **NOT** [`PuppeteerCrawler`](../api/puppeteer-crawler).

> Technically, it should also work with Puppeteer if you install it, but it's not guaranteed.

It uses the [`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`](https://playwright.dev/docs/api/environment-variables/)
environment variable to block installation of more browsers into your images (to keep them small).
If you want more browsers, either choose the [`actor-node-playwright](#actor-node-playwright) image
or override this env var.

The image supports XVFB by default, so you can run both `headless` and `headful` browsers with it.

```dockerfile
FROM apify/actor-node-playwright-chrome
```

## actor-node-playwright-firefox
Same idea as [`actor-node-playwright-chrome`](#actor-node-playwright-chrome), but with Firefox
pre-installed.

```dockerfile
FROM apify/actor-node-playwright-firefox
```

## actor-node-playwright-webkit
Same idea as [`actor-node-playwright-chrome`](#actor-node-playwright-chrome), but with WebKit
pre-installed.

```dockerfile
FROM apify/actor-node-playwright-webkit
```
