## Overview

The Apify SDK is available as the [`apify`](https://www.npmjs.com/package/apify) NPM package and it provides the following tools:

- [`CheerioCrawler`](https://sdk.apify.com/docs/api/cheerio-crawler) - Enables the parallel crawling of a large
  number of web pages using the [cheerio](https://www.npmjs.com/package/cheerio) HTML parser. This is the most
  efficient web crawler, but it does not work on websites that require JavaScript.

- [`PuppeteerCrawler`](https://sdk.apify.com/docs/api/puppeteer-crawler) - Enables the parallel crawling of
  a large number of web pages using the headless Chrome browser and [Puppeteer](https://github.com/puppeteer/puppeteer).
  The pool of Chrome browsers is automatically scaled up and down based on available system resources.

- [`PlaywrightCrawler`](https://sdk.apify.com/docs/api/playwright-crawler) - Unlike `PuppeteerCrawler`
  you can use [Playwright](https://github.com/microsoft/playwright) to manage almost any headless browser.
  It also provides a cleaner and more mature interface while keeping the ease of use and advanced features.

- [`BasicCrawler`](https://sdk.apify.com/docs/api/basic-crawler) - Provides a simple framework for the parallel
  crawling of web pages whose URLs are fed either from a static list or from a dynamic queue of URLs. This class
  serves as a base for the more specialized crawlers above.

- [`RequestList`](https://sdk.apify.com/docs/api/request-list) - Represents a list of URLs to crawl.
  The URLs can be passed in code or in a text file hosted on the web. The list persists its state so that crawling
  can resume when the Node.js process restarts.

- [`RequestQueue`](https://sdk.apify.com/docs/api/request-queue) - Represents a queue of URLs to crawl,
  which is stored either on a local filesystem or in the [Apify Cloud](https://apify.com). The queue is used
  for deep crawling of websites, where you start with several URLs and then recursively follow links to other pages.
  The data structure supports both breadth-first and depth-first crawling orders.

- [`Dataset`](https://sdk.apify.com/docs/api/dataset) - Provides a store for structured data and enables their export
  to formats like JSON, JSONL, CSV, XML, Excel or HTML. The data is stored on a local filesystem or in the Apify Cloud.
  Datasets are useful for storing and sharing large tabular crawling results, such as a list of products or real estate offers.

- [`KeyValueStore`](https://sdk.apify.com/docs/api/key-value-store) - A simple key-value store for arbitrary data
  records or files, along with their MIME content type. It is ideal for saving screenshots of web pages, PDFs
  or to persist the state of your crawlers. The data is stored on a local filesystem or in the Apify Cloud.

- [`AutoscaledPool`](https://sdk.apify.com/docs/api/autoscaled-pool) - Runs asynchronous background tasks,
  while automatically adjusting the concurrency based on free system memory and CPU usage. This is useful for running
  web scraping tasks at the maximum capacity of the system.

- [`Browser Utils`](https://sdk.apify.com/docs/api/puppeteer) - Provides several helper functions useful
  for web scraping. For example, to inject jQuery into web pages or to hide browser origin.

Additionally, the package provides various helper functions to simplify running your code on the Apify Cloud and thus
take advantage of its pool of proxies, job scheduler, data storage, etc.
For more information, see the [Apify SDK Programmer's Reference](https://sdk.apify.com).
