<h1 align="center">
    <a href="https://crawlee.dev">
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/apify/apify-ts/master/website/static/img/crawlee-dark.svg?sanitize=true">
          <img alt="Crawlee" src="https://raw.githubusercontent.com/apify/apify-ts/master/website/static/img/crawlee-light.svg?sanitize=true" width="500">
        </picture>
    </a>
    <br>
    <small>The scalable web crawling and scraping library for JavaScript</small>
</h1>

<p align=center>
    <a href="https://www.npmjs.com/package/@crawlee/core" rel="nofollow"><img src="https://img.shields.io/npm/v/@crawlee/core/next.svg" alt="NPM dev version" data-canonical-src="https://img.shields.io/npm/v/@crawlee/core/next.svg" style="max-width: 100%;"></a>
    <a href="https://www.npmjs.com/package/@crawlee/core" rel="nofollow"><img src="https://img.shields.io/npm/dm/@crawlee/core.svg" alt="Downloads" data-canonical-src="https://img.shields.io/npm/dm/@crawlee/core.svg" style="max-width: 100%;"></a>
    <a href="https://discord.gg/jyEM2PRvMU" rel="nofollow"><img src="https://img.shields.io/discord/801163717915574323?label=discord" alt="Chat on discord" data-canonical-src="https://img.shields.io/discord/801163717915574323?label=discord" style="max-width: 100%;"></a>
    <a href="https://github.com/apify/apify-ts/actions/workflows/test-and-release.yml"><img src="https://github.com/apify/apify-ts/actions/workflows/test-and-release.yml/badge.svg?branch=master" alt="Build Status" style="max-width: 100%;"></a>
</p>

>👉👉👉 Crawlee is the successor to [Apify SDK](https://sdk.apify.com). 🎉 Fully rewritten in **TypeScript** for a better developer experience, and with even more powerful anti-blocking features. The interface is almost the same as Apify SDK so upgrading is a breeze. Read [the upgrading guide](https://crawlee.dev/docs/upgrading/upgrading-to-v3) to learn about the changes. 👈👈👈

Crawlee simplifies the development of web crawlers, scrapers, data extractors and web automation jobs. It provides tools to manage and automatically scale a pool of headless browsers, to maintain queues of URLs to crawl, store crawling results to a local filesystem or into the cloud, rotate proxies and much more. Crawlee is available as the [`crawlee`](https://www.npmjs.com/package/crawlee) NPM package. It can be used either stand-alone in your own applications or in [actors](https://docs.apify.com/actor) running on the [Apify Cloud](https://apify.com/).

**View full documentation, guides and examples on the [Crawlee project website](https://crawlee.dev)**

> Would you like to work with us on Crawlee or similar projects? [We are hiring!](https://apify.com/jobs#senior-node.js-engineer)

## Motivation

Thanks to tools like [Playwright](https://github.com/microsoft/playwright), [Puppeteer](https://github.com/puppeteer/puppeteer) or [Cheerio](https://www.npmjs.com/package/cheerio), it is easy to write Node.js code to extract data from web pages. But eventually things will get complicated. For example, when you try to:

- Perform a deep crawl of an entire website using a persistent queue of URLs.
- Run your scraping code on a list of 100k URLs in a CSV file, without losing any data when your code crashes.
- Rotate proxies to hide your browser origin and keep user-like sessions.
- Disable browser fingerprinting protections used by websites.

Python has [Scrapy](https://scrapy.org/) for these tasks, but there was no such library for **JavaScript, the language of the web**. The use of JavaScript is natural, since the same language is used to write the scripts as well as the data extraction code running in a browser.

The goal of Crawlee is to fill this gap and provide a toolbox for generic web scraping, crawling and automation tasks in JavaScript. So don't reinvent the wheel every time you need data from the web, and focus on writing code specific to the target website, rather than developing commonalities.

## Overview

Crawlee is available as the [`crawlee`](https://www.npmjs.com/package/crawlee) NPM package and is also available via `@crawlee/*` packages. It provides the following tools:

- [`CheerioCrawler`](https://crawlee.dev/api/cheerio-crawler/class/CheerioCrawler) - Enables the parallel crawling of a large number of web pages using the [cheerio](https://www.npmjs.com/package/cheerio) HTML parser. This is the most efficient web crawler, but it does not work on websites that require JavaScript. Available also under `@crawlee/cheerio` package.

- [`PuppeteerCrawler`](https://crawlee.dev/api/puppeteer-crawler/class/PuppeteerCrawler) - Enables the parallel crawling of a large number of web pages using the headless Chrome browser and [Puppeteer](https://github.com/puppeteer/puppeteer). The pool of Chrome browsers is automatically scaled up and down based on available system resources. Available also under `@crawlee/puppeteer` package.

- [`PlaywrightCrawler`](https://crawlee.dev/api/playwright-crawler/class/PlaywrightCrawler) - Unlike `PuppeteerCrawler` you can use [Playwright](https://github.com/microsoft/playwright) to manage almost any headless browser. It also provides a cleaner and more mature interface while keeping the ease of use and advanced features. Available also under `@crawlee/playwright` package.

- [`BasicCrawler`](https://crawlee.dev/api/basic-crawler/class/BasicCrawler) - Provides a simple framework for the parallel crawling of web pages whose URLs are fed either from a static list or from a dynamic queue of URLs. This class serves as a base for the more specialized crawlers above. Available also under `@crawlee/basic` package.

- [`RequestList`](https://crawlee.dev/api/core/class/RequestList) - Represents a list of URLs to crawl. The URLs can be passed in code or in a text file hosted on the web. The list persists its state so that crawling can resume when the Node.js process restarts. Available also under `@crawlee/core` package.

- [`RequestQueue`](https://crawlee.dev/api/core/class/RequestQueue) - Represents a queue of URLs to crawl, which is stored either in memory, on a local filesystem, or in the [Apify Cloud](https://apify.com). The queue is used for deep crawling of websites, where you start with several URLs and then recursively follow links to other pages. The data structure supports both breadth-first and depth-first crawling orders. Available also under `@crawlee/core` package.

- [`Dataset`](https://crawlee.dev/api/core/class/Dataset) - Provides a store for structured data and enables their export to formats like JSON, JSONL, CSV, XML, Excel or HTML. The data is stored on a local filesystem or in the Apify Cloud. Datasets are useful for storing and sharing large tabular crawling results, such as a list of products or real estate offers. Available also under `@crawlee/core` package.

- [`KeyValueStore`](https://crawlee.dev/api/core/class/KeyValueStore) - A simple key-value store for arbitrary data records or files, along with their MIME content type. It is ideal for saving screenshots of web pages, PDFs or to persist the state of your crawlers. The data is stored on a local filesystem or in the Apify Cloud. Available also under `@crawlee/core` package.

- [`AutoscaledPool`](https://crawlee.dev/api/core/class/AutoscaledPool) - Runs asynchronous background tasks, while automatically adjusting the concurrency based on free system memory and CPU usage. This is useful for running web scraping tasks at the maximum capacity of the system. Available also under `@crawlee/core` package.

Additionally, the package provides various helper functions to simplify running your code on the Apify Cloud and thus take advantage of its pool of proxies, job scheduler, data storage, etc. For more information, see the [Crawlee Programmer's Reference](https://crawlee.dev).

## Quick Start

This short tutorial will set you up to start using Crawlee in a minute or two. If you want to learn more, proceed to the [Getting Started](https://crawlee.dev/docs/guides/getting-started) tutorial that will take you step by step through creating your first scraper.

### Local stand-alone usage

Crawlee requires [Node.js](https://nodejs.org/en/) 16 or later. Add Crawlee to any Node.js project by running:

```bash
npm install crawlee playwright
```

> Neither `playwright` nor `puppeteer` are bundled with Crawlee to reduce install size and allow greater flexibility. That's why we install it with NPM. You can choose one, both, or neither.

Run the following example to perform a recursive crawl of a website using Playwright. For more examples showcasing various features of Crawlee, [see the Examples section of the documentation](https://crawlee.dev/docs/examples/crawl-multiple-urls).

```javascript
import { PlaywrightCrawler, Dataset } from 'crawlee';

const crawler = new PlaywrightCrawler();

crawler.router.addDefaultHandler(async ({ request, page, enqueueLinks }) => {
    const title = await page.title();
    console.log(`Title of ${request.loadedUrl} is '${title}'`);

    // save some results
    await Dataset.pushData({ title, url: request.loadedUrl });

    // enqueue all links targeting the same hostname
    await enqueueLinks();
});

await crawler.run(['https://www.iana.org/']);
```

When you run the example, you should see Crawlee automating a Chrome browser.

![Chrome Scrape](https://crawlee.dev/img/chrome_scrape.gif)

By default, Crawlee stores data to `./crawlee_storage` in the current working directory. You can override this directory via `CRAWLEE_STORAGE_DIR` env var. For details, see [Environment variables](https://crawlee.dev/docs/guides/environment-variables), [Request storage](https://crawlee.dev/docs/guides/request-storage) and [Result storage](https://crawlee.dev/docs/guides/result-storage).

### Local usage with Crawlee command-line interface (CLI)

To create a boilerplate of your project we can use the [Crawlee command-line interface (CLI)](https://github.com/apify/apify-cli) tool.

Let's create a boilerplate of your new web crawling project by running:

```bash
npx crawlee create my-hello-world
```

The CLI will prompt you to select a project boilerplate template - just pick "Hello world". The tool will create a directory called `my-hello-world` with a Node.js project files. You can run the project as follows:

```bash
cd my-hello-world
npx crawlee run
```

By default, the crawling data will be stored in a local directory at `./crawlee_storage`. For example, the input JSON file for the actor is expected to be in the default key-value store in `./crawlee_storage/key_value_stores/default/INPUT.json`.

### Usage on the Apify platform

Now if we want to run our new crawler on Apify Platform, we first need to download the `apify-cli` and login with our token:

> We could also use the Apify CLI to generate a new project, which can be better suited if we want to run it on the Apify Platform.

```bash
npm i -g apify-cli
apify login
```

Finally, we can easily deploy our code to the Apify platform by running:

```bash
apify push
```

Your script will be uploaded to the Apify platform and built there so that it can be run. For more information, view the
[Apify Actor](https://docs.apify.com/cli) documentation.

You can also develop your web scraping project in an online code editor directly on the [Apify platform](https://crawlee.dev/docs/guides/apify-platform). You'll need to have an Apify Account. Go to [Actors](https://console.apify.com/actors), page in the Apify Console, click <i>Create new</i> and then go to the <i>Source</i> tab and start writing your code or paste one of the examples from the Examples section.

For more information, view the [Apify actors quick start guide](https://docs.apify.com/actor/quick-start).

## Support

If you find any bug or issue with Crawlee, please [submit an issue on GitHub](https://github.com/apify/apify-ts/issues). For questions, you can ask on [Stack Overflow](https://stackoverflow.com/questions/tagged/apify) or contact support@apify.com

## Contributing

Your code contributions are welcome, and you'll be praised to eternity! If you have any ideas for improvements, either submit an issue or create a pull request. For contribution guidelines and the code of conduct, see [CONTRIBUTING.md](https://github.com/apify/apify-ts/blob/master/CONTRIBUTING.md).

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE.md](https://github.com/apify/apify-ts/blob/master/LICENSE.md) file for details.
