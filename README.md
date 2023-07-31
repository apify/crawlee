<h1 align="center">
    <a href="https://crawlee.dev">
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/apify/crawlee/master/website/static/img/crawlee-dark.svg?sanitize=true">
          <img alt="Crawlee" src="https://raw.githubusercontent.com/apify/crawlee/master/website/static/img/crawlee-light.svg?sanitize=true" width="500">
        </picture>
    </a>
    <br>
    <small>A web scraping and browser automation library</small>
</h1>

<p align=center>
    <a href="https://www.npmjs.com/package/@crawlee/core" rel="nofollow"><img src="https://img.shields.io/npm/v/@crawlee/core.svg" alt="NPM latest version" data-canonical-src="https://img.shields.io/npm/v/@crawlee/core/next.svg" style="max-width: 100%;"></a>
    <a href="https://www.npmjs.com/package/@crawlee/core" rel="nofollow"><img src="https://img.shields.io/npm/dm/@crawlee/core.svg" alt="Downloads" data-canonical-src="https://img.shields.io/npm/dm/@crawlee/core.svg" style="max-width: 100%;"></a>
    <a href="https://discord.gg/jyEM2PRvMU" rel="nofollow"><img src="https://img.shields.io/discord/801163717915574323?label=discord" alt="Chat on discord" data-canonical-src="https://img.shields.io/discord/801163717915574323?label=discord" style="max-width: 100%;"></a>
    <a href="https://github.com/apify/crawlee/actions/workflows/test-and-release.yml"><img src="https://github.com/apify/crawlee/actions/workflows/test-and-release.yml/badge.svg?branch=master" alt="Build Status" style="max-width: 100%;"></a>
</p>

Crawlee covers your crawling and scraping end-to-end and **helps you build reliable scrapers. Fast.**

Your crawlers will appear human-like and fly under the radar of modern bot protections even with the default configuration. Crawlee gives you the tools to crawl the web for links, scrape data, and store it to disk or cloud while staying configurable to suit your project's needs.

Crawlee is available as the [`crawlee`](https://www.npmjs.com/package/crawlee) NPM package.

> 👉 **View full documentation, guides and examples on the [Crawlee project website](https://crawlee.dev)** 👈

## Installation

We recommend visiting the [Introduction tutorial](https://crawlee.dev/docs/introduction) in Crawlee documentation for more information.

> Crawlee requires **Node.js 16 or higher**.

### With Crawlee CLI

The fastest way to try Crawlee out is to use the **Crawlee CLI** and choose the **Getting started example**. The CLI will install all the necessary dependencies and add boilerplate code for you to play with.

```bash
npx crawlee create my-crawler
```

```bash
cd my-crawler
npm start
```

### Manual installation
If you prefer adding Crawlee **into your own project**, try the example below. Because it uses `PlaywrightCrawler` we also need to install [Playwright](https://playwright.dev). It's not bundled with Crawlee to reduce install size.

```bash
npm install crawlee playwright
```

```js
import { PlaywrightCrawler, Dataset } from 'crawlee';

// PlaywrightCrawler crawls the web using a headless
// browser controlled by the Playwright library.
const crawler = new PlaywrightCrawler({
    // Use the requestHandler to process each of the crawled pages.
    async requestHandler({ request, page, enqueueLinks, log }) {
        const title = await page.title();
        log.info(`Title of ${request.loadedUrl} is '${title}'`);

        // Save results as JSON to ./storage/datasets/default
        await Dataset.pushData({ title, url: request.loadedUrl });

        // Extract links from the current page
        // and add them to the crawling queue.
        await enqueueLinks();
    },
    // Uncomment this option to see the browser window.
    // headless: false,
});

// Add first URL to the queue and start the crawl.
await crawler.run(['https://crawlee.dev']);
```

By default, Crawlee stores data to `./storage` in the current working directory. You can override this directory via Crawlee configuration. For details, see [Configuration guide](https://crawlee.dev/docs/guides/configuration), [Request storage](https://crawlee.dev/docs/guides/request-storage) and [Result storage](https://crawlee.dev/docs/guides/result-storage).

## 🛠 Features

- Single interface for **HTTP and headless browser** crawling
- Persistent **queue** for URLs to crawl (breadth & depth first)
- Pluggable **storage** of both tabular data and files
- Automatic **scaling** with available system resources
- Integrated **proxy rotation** and session management
- Lifecycles customizable with **hooks**
- **CLI** to bootstrap your projects
- Configurable **routing**, **error handling** and **retries**
- **Dockerfiles** ready to deploy
- Written in **TypeScript** with generics

### 👾 HTTP crawling

- Zero config **HTTP2 support**, even for proxies
- Automatic generation of **browser-like headers**
- Replication of browser **TLS fingerprints**
- Integrated fast **HTML parsers**. Cheerio and JSDOM
- Yes, you can scrape **JSON APIs** as well

### 💻 Real browser crawling

- JavaScript **rendering** and **screenshots**
- **Headless** and **headful** support
- Zero-config generation of **human-like fingerprints**
- Automatic **browser management**
- Use **Playwright** and **Puppeteer** with the same interface
- **Chrome**, **Firefox**, **Webkit** and many others

## Usage on the Apify platform

Crawlee is open-source and runs anywhere, but since it's developed by [Apify](https://apify.com), it's easy to set up on the Apify platform and run in the cloud. Visit the [Apify SDK website](https://sdk.apify.com) to learn more about deploying Crawlee to the Apify platform.

## Support

If you find any bug or issue with Crawlee, please [submit an issue on GitHub](https://github.com/apify/crawlee/issues). For questions, you can ask on [Stack Overflow](https://stackoverflow.com/questions/tagged/apify), in GitHub Discussions or you can join our [Discord server](https://discord.com/invite/jyEM2PRvMU).

## Contributing

Your code contributions are welcome, and you'll be praised to eternity! If you have any ideas for improvements, either submit an issue or create a pull request. For contribution guidelines and the code of conduct, see [CONTRIBUTING.md](https://github.com/apify/crawlee/blob/master/CONTRIBUTING.md).

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE.md](https://github.com/apify/crawlee/blob/master/LICENSE.md) file for details.
