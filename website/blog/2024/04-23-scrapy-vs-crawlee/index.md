---
slug: scrapy-vs-crawlee
title: 'Scrapy vs. Crawlee'
description: 'Which web scraping library is best for you?'
image: ./img/scrapy-vs-crawlee.png
author: Saurav Jain
authorTitle: Developer Community Manager
authorURL: https://github.com/souravjain540
authorImageURL: https://avatars.githubusercontent.com/u/53312820?v=4
authorTwitter: sauain
---


Hey, crawling masters!

Welcome to another post on the Crawlee blog; this time, we are going to compare Scrapy with Crawlee, one of the oldest and most popular web scraping libraries in this world. This article will answer your usual questions about when to use Scrapy or when it would be better to use Crawlee instead. This article will be the first part of many articles comparing Crawlee with Scrapy in various technical aspects. 

## Introduction:

[Scrapy](https://scrapy.org/) is an open-source Python-based web scraping framework that extracts data from websites. In Scrapy, you create spiders, which are nothing but autonomous scripts to download and process web content. The limitation of Scrapy is that it does not work very well with JavaScript-heavy websites, as it was designed for static HTML pages. We will do a comparison later in the article about this. 

Crawlee is also an open-source library that originated as [Apify SDK](https://docs.apify.com/sdk/js/). Crawlee has the advantage of being a latecomer or, say, the latest library in the market, so it already has many features that Scrapy lacks, like autoscaling, headless browsing, working with JavaScript-heavy websites without any plugins, and many more, which we are going to explain later on.

<!--truncate-->

## Feature comparison

There are a lot of things that we can compare between Scrapy and Crawlee. This article will be the first part of a series comparing Scrapy and Crawlee on various parameters. 

We will compare both libraries on various parameters, starting with language and development environments and essential features that make the scraping process easy for developers, like autoscaling, headless browsing, queue management, etc. 



## Language and development environments:

Scrapy is written in Python, making it easier for the data science community to integrate it with various tools with Python. While Scrapy offers very detailed documentation, for first-timers, sometimes it takes work to start with Scrapy. One of the reasons why it is considered not so beginner-friendly is its [complex architecture](https://docs.scrapy.org/en/latest/topics/architecture.html), which consists of various components like spiders, middleware, item pipelines, and settings. For beginners, learning all of these can be a time-consuming task.

On the other hand, Crawlee is one of the few web scraping and automation libraries that supports JavaScript and TypeScript. Crawlee supports CLI as Scrapy does, but the difference that it makes very easy for beginners to start with is their [pre-built templates](https://github.com/apify/crawlee/tree/master/packages/templates/templates) in TypeScript and JavaScript supporting Playwright and Puppeteer. It helps beginners to get a quick understanding of the file structure and how it works.

## Working with JavaScript-heavy websites

One problem that occurs with Scrapy is that it needs to work better with JavaScript-heavy websites. For example, we will try to scrape a JavaScript-heavy website; we will try scraping `showName,` `seasons,` and `synopsis` from one of the famous Netflix famous shows pages, [Stranger Things](https://www.netflix.com/in/title/80057281).

With Scrapy, when we try to scrape all of the above things by installing `scrapy` and then creating a spider with the following script:

```python
import scrapy

class NetflixSpider(scrapy.Spider):
    name = 'netflix'
    allowed_domains = ['netflix.com']
    start_urls = ['https://www.netflix.com/title/80057281']

    def parse(self, response):
        title = response.css('.title-title::text').get()
        seasons = response.css('.test_dur_str::text').get()
        about = response.css('div.title-info-synopsis::text').get()

        yield {
            'title': title,
            'seasons': seasons,
            'about': about
        }
```

The GET produces a `200` result; still, we get an empty array in the result tab because Scrapy could not render the JavaScript.

When we scrape the same parameters from the same website using Crawlee using the following script:

```js
const { PlaywrightCrawler, Dataset } = require('crawlee');

async function pageFunction({ page, request }) {

await page.waitForSelector('.info-container');

    const title = await page.$eval('.title-title', node => node.innerText);
    const seasons = await page.$eval('.test_dur_str', node => node.innerText);
    const about = await page.$eval('.title-info-synopsis', node => node.innerText);

    await Dataset.pushData({
        url: request.url,
        title,
        seasons,
        about
    });
}

const crawler = new PlaywrightCrawler({
    requestHandler: pageFunction,
    headless: true
});

async function runCrawler() {
    try {
        await crawler.run(['https://www.netflix.com/title/80057281']);
    } catch (error) {
        console.error('Crawler failed:', error);
    }
}

runCrawler();
```

It scrapes all the required information in just a few seconds because it supports JavaScript-heavy websites.


## Headless browsing

Scrapy does not support headless browsers natively, but it supports them with its plugin system, one of the best examples of which is its [Playwright plugin](https://github.com/scrapy-plugins/scrapy-playwright/tree/main). To use the `scrapy-playwright` plugin, you have to install the plugin and Playwright before it can be used. After installing both libraries, you have to enable `ScrapyPlaywrightMiddleware` by updating the `DOWNLOADER_MIDDLEWARES` setting in your settings.py file.

With the Playwright integration enabled you can make requests in your spiders using the `scrapy.Request` class, but with an additional `playwright` argument in each request's `meta` dictionary.

Crawlee, on the other hand, offers a unified interface for HTTP requests and [headless browsing](https://crawlee.dev/docs/guides/javascript-rendering#headless-browsers) using [Puppeteer](https://github.com/puppeteer/puppeteer/) or [Playwright](https://github.com/microsoft/playwright). This integration allows developers to easily switch between simple HTTP scraping and complex browser-based scraping within the same framework, simplifying the handling of dynamic JavaScript content. A simple example showing scraping `.ActorStoreItem` from [Apify Store](https://apify.com/store) using Pla

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<Tabs>
<TabItem value="js" label="Playwright">

```js
import { PlaywrightCrawler } from 'crawlee';

const crawler = new PlaywrightCrawler({
    async requestHandler({ page }) {
        // page.locator points to an element in the DOM
        // using a CSS selector, but it does not access it yet.
        const actorCard = page.locator('.ActorStoreItem').first();
        // Upon calling one of the locator methods Playwright
        // waits for the element to render and then accesses it.
        const actorText = await actorCard.textContent();
        console.log(`ACTOR: ${actorText}`);
    },
});

await crawler.run(['https://apify.com/store']);
```

</TabItem>
<TabItem value="js" label="Puppeteer">

```js
import { PuppeteerCrawler } from 'crawlee';

const crawler = new PuppeteerCrawler({
    async requestHandler({ page }) {
        // Puppeteer does not have the automatic waiting functionality
        // of Playwright, so we have to explicitly wait for the element.
        await page.waitForSelector('.ActorStoreItem');
        // Puppeteer does not have helper methods like locator.textContent,
        // so we have to manually extract the value using in-page JavaScript.
        const actorText = await page.$eval('.ActorStoreItem', (el) => {
            return el.textContent;
        });
        console.log(`ACTOR: ${actorText}`);
    },
});

await crawler.run(['https://apify.com/store']);
```

</TabItem>



### Autoscaling Support

Scrapy does not have autoscaling capabilities inbuilt, but it can be done using external services like [Scrapyd](https://scrapyd.readthedocs.io/en/latest/) or deployed in a distributed manner with Scrapy Cluster.

Crawlee has [built-in autoscaling](https://crawlee.dev/api/core/class/AutoscaledPool) with `AutoscaledPool`. It increases the number of requests that are processed concurrently within one crawler.

### Queue Management

Scrapy supports both breadth-first and depth-first crawling strategies using a disk-based queuing system. By default, it uses the LIFO queue for the pending requests, which means it is using depth-first order, but if you want to use breadth-first order, you can do it by changing these settings:

```
DEPTH_PRIORITY = 1 
SCHEDULER_DISK_QUEUE = "scrapy.squeues.PickleFifoDiskQueue" 
SCHEDULER_MEMORY_QUEUE = "scrapy.squeues.FifoMemoryQueue"
```

Crawlee offers [advanced queue management](https://crawlee.dev/api/core/class/RequestQueue) through `RequestQueue`, designed to manage crawling tasks focusing on persistence and recovery. The queue does not explicitly focus on depth-first or breadth-first strategies but rather on ensuring that all tasks are handled efficiently and can be paused and resumed. This design is particularly effective for long-running crawls that might be interrupted.

### CLI Support

Scrapy has a [powerful command-line interface](https://docs.scrapy.org/en/latest/topics/commands.html#command-line-tool) that offers functionalities like starting a project, generating spiders, and controlling the crawling process.

Scrapy CLI comes with Scrapy installation. Just run this command, and you are good to go:


`pip install scrapy`

Crawlee also [includes a CLI tool](https://crawlee.dev/docs/quick-start#installation-with-crawlee-cli) (`crawlee-cli`) that facilitates project setup, crawler creation and execution, streamlining the development process for users familiar with Node.js environments. The command for installation is: 

`npx crawlee create my-crawler`
 
### Proxy Rotation and Storage Management

Scrapy handles it via [custom middleware](https://pypi.org/project/scrapy-rotating-proxies/) or plugins, which requires additional development effort. You have to install their `scrapy-rotating-proxies` package using pip. You can add your proxies to the `ROTATING_PROXY_LIST` or add a path of your rotating proxied to the `ROTATING_PROXY_LIST_PATH`.

In Crawlee, you can [use your own proxy servers](https://crawlee.dev/docs/guides/proxy-management) or proxy servers acquired from third-party providers. If you already have your proxy URLs, you can start using them as easy as that:

```js
import { ProxyConfiguration } from 'crawlee';

const proxyConfiguration = new ProxyConfiguration({
    proxyUrls: [
        'http://proxy-1.com',
        'http://proxy-2.com',
    ]
});
const crawler = new CheerioCrawler({
    proxyConfiguration,
    // ...
});
```
Crawlee also has [`SessionPool`](https://crawlee.dev/api/core/class/SessionPool), a built-in allocation system for proxies. It handles the rotation, creation, and persistence of user-like sessions. It creates a pool of Session instances that are randomly rotated.

### Data Storage

One of the most frequently required features when implementing scrapers is being able to store the scraped data as an "export file".

Scrapy provides this functionality out of the box with the [`Feed Exports`](https://docs.scrapy.org/en/latest/topics/feed-exports.html), which allows to generate feeds with the scraped items, using multiple serialization formats and storage backends. It supports `csv, json, json lines, xml.`

The simplest way to store them is via CLI:

```bash
scrapy crawl book -o data/example_data.csv
scrapy crawl book -o data/example_data.json
scrapy crawl book -o data/example_data.jsonl
scrapy crawl book -o data/example_data.xml
```

Crawlee has [simple data storage](https://blog.apify.com/crawlee-data-storage-types/) solution and supports multiple data storage options, including local storage, key-value stores, and datasets. It integrates storage directly into crawlers, making it easy to store data in JSON format or any structured form.

- You can use local storage with dataset

```js
const { PlaywrightCrawler, Dataset } = require('crawlee');

async function handlePage({ request, page }) {
    const title = await page.title();
    const price = await page.textContent('.price');
    
    // Store data in a local dataset
    await Dataset.pushData({
        url: request.url,
        title,
        price
    });
}

const crawler = new PlaywrightCrawler({
    requestHandler: handlePage,
});

crawler.run(['http://amazon.com']);
```

- Using Key-Value Store for Simple Data
```js
const { KeyValueStore } = require('crawlee');

async function storeData() {
    const store = await KeyValueStore.open();
    await store.setValue('MY_KEY', { foo: 'bar' });
}

storeData();
```

### Anti-blocking and Fingerprints

In Scrapy, handling anti-blocking strategies like [IP rotation](https://pypi.org/project/scrapy-rotated-proxy/), [user-agent rotation](https://python.plainenglish.io/rotating-user-agent-with-scrapy-78ca141969fe), custom solutions via middleware, and plugins are needed.

Crawlee provides HTTP crawling and [browser fingerprints](https://crawlee.dev/docs/guides/avoid-blocking) with zero configuration necessary; fingerprints are enabled by default and available in `PlaywrightCrawler` and `PuppeteerCrawler` but work with `CheerioCrawler` and the other HTTP Crawlers too. 

### Error handling

Both libraries support error-handling practices like automatic retries, logging, and custom error handling.

In Scrapy, you can handle errors using middleware and [signals](https://docs.scrapy.org/en/latest/topics/signals.html). There are also [exceptions](https://docs.scrapy.org/en/latest/topics/exceptions.html) like `IgnoreRequest`, which can be raised by Scheduler or any downloader middleware to indicate that the request should be ignored. Similarly, a spider callback can raise' CloseSpider' to close the spider.

Scrapy has built-in support for retrying failed requests. You can configure the retry policy (e.g., the number of retries, retrying on particular HTTP codes) via settings such as `RETRY_TIMES`, as shown in the example:

```py
# In settings.py
RETRY_ENABLED = True
RETRY_TIMES = 2  # Number of retry attempts
RETRY_HTTP_CODES = [500, 502, 503, 504, 522, 524]  # HTTP error codes to retry
```

In Crawlee, in addition to having many custom errors to handle the flow of the program like `TimeoutError`, `NavigationError`, if you need to, you can also set up your own `ErrorHandler` like this: 

```js
const { PlaywrightCrawler, Dataset, log } = require('crawlee');

async function handlePage({ request, page, enqueueLinks }) {
    try {
        await page.waitForSelector('.content');

        // Extract data
        const title = await page.title();
        const content = await page.textContent('.content');
        // Save data to the dataset
        await Dataset.pushData({ url: request.url, title, content });
        // Optionally, enqueue more links found on the page
        await enqueueLinks({ selector: 'a.next-page' });

    } catch (error) {
        // Log a warning for each request that encounters an error
        log.warning(`Error processing ${request.url}: ${error.message}`);
    }
}

const crawler = new PlaywrightCrawler({
    requestHandler: handlePage, // Function defined above
    failedRequestHandler: async ({ request, error }) => {
        // This function runs for each request that failed even after retries
        log.error(`Request ${request.url} ultimately failed with error: ${error.message}`);

        // Optionally, save details of the failed request for later analysis
        await Dataset.pushData({
            url: request.url,
            error: error.message,
            status: 'failed'
        });
    },
    maxRetries: 3, // Number of retry attempts for failed requests
    headless: true // Run headlessly for production scraping
});

// Run the crawler with a set of initial URLs
(async () => {
    try {
        await crawler.run(['INSERT_URL']);
    } catch (error) {
        log.error('Crawler run failed:', error.message);
    }
})();

```

Crawlee provides a built-in logging mechanism via `log`, allowing you to log warnings, errors, and other information effectively.
The `maxRetries` option controls how often Crawlee will retry a request before marking it as failed.



### Deployment using Docker

Scrapy can be containerized using Docker, though it typically requires manual setup to create Dockerfiles and configure environments. While Crawlee includes [ready-to-use Docker configurations](https://crawlee.dev/docs/guides/docker-images), making deployment straightforward across various environments without additional configuration.

## Community 

Both of the projects are open source. Scrapy benefits from a large and well-established community. It has been around since 2008 and has garnered significant attention and usage among developers, particularly those in the Python ecosystem. 

Crawlee started its journey as Apify SDK in 2021. It now has more than [12000 stars on GitHub](https://github.com/apify/crawlee) and a community of more than 7000 developers in their [Discord Community](https://apify.com/discord), used by TypeScript and JavaScript community.

## Conclusion

Both frameworks can handle a wide range of scraping tasks, and the best choice will depend on specific technical needs like language preference, project requirements, ease of use, etc.

If you are comfortable with Python and want to work only with it, go with Scrapy. It has very detailed documentation, and it is one of the oldest and most stable libraries in the space, but if you want to explore or are comfortable working with TypeScript or JavaScript, our recommendation is Crawlee. With all the valuable features like a single interface for HTTP requests and headless browsing, making it work well with JavaScript-heavy websites and autoscaling and fingerprint support, it is the best choice for scraping anything and everything from the internet.

As promised, this is just the first of the many articles comparing Scrapy and Crawlee. With the upcoming articles, you will learn more about every technical detail. 

Meanwhile, if you want to learn more about Crawlee, you can visit this article to learn how to scrape Amazon products using Crawlee.
