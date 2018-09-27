# Apify SDK: The scalable web crawling and scraping library for JavaScript
<!-- Mirror this part to src/index.js -->

[![npm version](https://badge.fury.io/js/apify.svg)](https://www.npmjs.com/package/apify)
[![Build Status](https://travis-ci.org/apifytech/apify-js.svg?branch=master)](https://travis-ci.org/apifytech/apify-js)

<div id="include-readme-1">
  Apify SDK simplifies the development of web crawlers, scrapers, data extractors and web automation jobs.
  It provides tools to manage and automatically scale a pool of headless Chrome / Puppeteer instances,
  to maintain queues of URLs to crawl, store crawling results to a local filesystem or into the cloud,
  rotate proxies and much more.
  The SDK is available as the <a href="https://www.npmjs.com/package/apify" target="_blank"><code>apify</code></a> NPM package.
  It can be used either stand-alone in your own applications
  or in <a href="https://www.apify.com/docs/actor" target="_blank">actors</a>
  running on the <a href="https://www.apify.com/" target="_blank">Apify Cloud</a>.
</div>

<br>

<div>
  View the full <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest/" target="_blank">Apify SDK Programmer's Reference</a> on a separate page.
</div>

<!--
<br /><br />
<p align="center">
  <img src="https://www.apify.com/ext/logo.png" width="250" />
</p>
-->

## Table of Contents

<!-- toc -->

- [Motivation](#motivation)
- [Overview](#overview)
- [Getting started](#getting-started)
  * [Local stand-alone usage](#local-stand-alone-usage)
  * [Local usage with Apify command-line interface (CLI)](#local-usage-with-apify-command-line-interface-cli)
  * [Usage on the Apify Cloud](#usage-on-the-apify-cloud)
- [What is an "actor"?](#what-is-an-actor)
- [Examples](#examples)
  * [Crawl several pages in raw HTML](#crawl-several-pages-in-raw-html)
  * [Crawl an external list of URLs with Cheerio](#crawl-an-external-list-of-urls-with-cheerio)
  * [Recursively crawl a website using Puppeteer](#recursively-crawl-a-website-using-puppeteer)
  * [Save page screenshots](#save-page-screenshots)
  * [Open web page in Puppeteer via Apify Proxy](#open-web-page-in-puppeteer-via-apify-proxy)
  * [Invoke another actor](#invoke-another-actor)
  * [Use an actor as an API](#use-an-actor-as-an-api)
- [Environment variables](#environment-variables)
- [Data storage](#data-storage)
  * [Key-value store](#key-value-store)
  * [Dataset](#dataset)
  * [Request queue](#request-queue)
- [Puppeteer live view](#puppeteer-live-view)
- [Support](#support)
- [Contributing](#contributing)

<!-- tocstop -->

<div id="include-readme-2">

## Motivation
<!-- Mirror this part to src/index.js -->

Thanks to tools like [Puppeteer](https://github.com/GoogleChrome/puppeteer) or
[cheerio](https://www.npmjs.com/package/cheerio),
it is easy to write Node.js code to extract data from web pages.
But eventually things will get complicated. For example, when you try to:

* Perform a deep crawl of an entire website using a persistent queue of URLs.
* Run your scraping code on a list of 100k URLs in a CSV file,
  without losing any data when your code crashes.
* Rotate proxies to hide your browser origin.
* Schedule the code to run periodically and send notification on errors.
* Disable browser fingerprinting protections used by websites.

Python has [Scrapy](https://scrapy.org/) for these tasks, but there was no
such library for **JavaScript, the language of the web**.
The use of JavaScript is natural,
since the same language is used to write the scripts as well as the data extraction code running in a browser.

The goal of the Apify SDK is to fill this gap and provide a toolbox
for generic web scraping, crawling and automation tasks in JavaScript.
So don't reinvent the wheel every time you need data from the web,
and focus on writing code specific to the target website, rather than developing commonalities.

## Overview

The Apify SDK is available as the <a href="https://www.npmjs.com/package/apify"><code>apify</code></a> NPM package and it provides the following tools:

<ul>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#BasicCrawler"><code>BasicCrawler</code></a>
    - Provides a simple framework for the parallel crawling of web pages
    whose URLs are fed either from a static list or from a dynamic queue of URLs.
    This class serves as a base for more complex crawlers (see below).
  </li>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#CheerioCrawler"><code>CheerioCrawler</code></a>
    - Enables the parallel crawling of a large number of web pages
    using the <a href="https://www.npmjs.com/package/cheerio" target="_blank">cheerio</a>
    HTML parser.
    This is the most efficient web crawler, but it does not work on websites that require JavaScript.
  </li>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#PuppeteerCrawler"><code>PuppeteerCrawler</code></a>
    - Enables the parallel crawling of a large number of web pages using the headless Chrome browser
    and <a href="https://github.com/GoogleChrome/puppeteer">Puppeteer</a>.
    The pool of Chrome browsers is automatically scaled up and down based on available system resources.
  </li>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#PuppeteerPool"><code>PuppeteerPool</code></a>
    - Provides web browser tabs for user jobs
    from an automatically-managed pool of Chrome browser instances, with configurable browser recycling and retirement policies.
    Supports reuse of the disk cache to speed up the crawling of websites and reduce proxy bandwidth.
  </li>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestList"><code>RequestList</code></a>
    - Represents a list of URLs to crawl. The URLs can be passed in code or in a text file hosted on the web.
    The list persists its state so that crawling can resume
    when the Node.js process restarts.
  </li>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestQueue"><code>RequestQueue</code></a>
    - Represents a queue of URLs to crawl, which is stored either on a local filesystem or in the Apify Cloud.
    The queue is used for deep crawling of websites, where you start with
    several URLs and then recursively follow links to other pages.
    The data structure supports both breadth-first and depth-first crawling orders.
  </li>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#Dataset"><code>Dataset</code></a>
    - Provides a store for structured data and enables their
    export to formats like JSON, JSONL, CSV, XML, Excel or HTML.
    The data is stored on a local filesystem or in the Apify Cloud.
    Datasets are useful for storing and sharing large tabular crawling results,
    such as a list of products or real estate offers.
  </li>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#KeyValueStore"><code>KeyValueStore</code></a>
    - A simple key-value store for arbitrary data records or files, along with their MIME content type.
    It is ideal for saving screenshots of web pages, PDFs or to persist the state of your crawlers.
    The data is stored on a local filesystem or in the Apify Cloud.
  </li>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#AutoscaledPool"><code>AutoscaledPool</code></a>
    - Runs asynchronous background tasks, while automatically adjusting the concurrency
    based on free system memory and CPU usage. This is useful for running web scraping tasks
    at the maximum capacity of the system.
  </li>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#utils-puppeteer"><code>PuppeteerUtils</code></a>
    - Provides several helper functions useful for web scraping. For example, to inject jQuery into web pages
    or to hide browser origin.
  </li>
  <li>
    Additionally, the package provides various helper functions to simplify
    running your code on the Apify Cloud and thus
    take advantage of its pool of proxies, job scheduler, data storage, etc.
    For more information,
    see the <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest">Apify SDK Programmer's Reference</a>.
  </li>
</ul>


## Getting started

The Apify SDK requires <a href="https://nodejs.org/en/" target="_blank">Node.js</a> 8 or later.

### Local stand-alone usage

Add Apify SDK to any Node.js project by running:

```bash
npm install apify --save
```

Run the following example to perform a recursive crawl of a website using Puppeteer.

```javascript
const Apify = require('apify');

Apify.main(async () => {
    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest(new Apify.Request({ url: 'https://www.iana.org/' }));
    const pseudoUrls = [new Apify.PseudoUrl('https://www.iana.org/[.*]')];

    const crawler = new Apify.PuppeteerCrawler({
        requestQueue,
        handlePageFunction: async ({ request, page }) => {
            const title = await page.title();
            console.log(`Title of ${request.url}: ${title}`);
            await Apify.utils.puppeteer.enqueueLinks(page, 'a', pseudoUrls, requestQueue);
        },
        maxRequestsPerCrawl: 100,
        maxConcurrency: 10,
    });

    await crawler.run();
});
```

When you run the example, you should see Chrome browser automated.

<p style="text-align:center" align="center">
  <img src="https://raw.githubusercontent.com/apifytech/apify-js/feature/readme/docs/hello-world-browsers.gif" width="600">
</p>

By default, Apify SDK stores data to
`./apify_storage` in the current working directory.
You can override this behavior by setting either the
`APIFY_LOCAL_STORAGE_DIR` or `APIFY_TOKEN` environment variable.
For details, see [Environment variables](#environment-variables)
and [Data storage](#data-storage).

### Local usage with Apify command-line interface (CLI)

To avoid the need to set the environment variables manually,
to create a boilerplate of your project,
and to enable pushing and running your code on the Apify Cloud,
you can use the
<a href="https://github.com/apifytech/apify-cli">Apify command-line interface</a> (CLI) tool.

Install the CLI by running:

```bash
npm -g install apify-cli
```

You might need to run the above command with `sudo`, depending on how crazy your configuration is.

Now create a boilerplate of your new web crawling project by running:

```bash
apify create my-hello-world
```

The CLI will prompt you to select a project boilerplate template - just pick "Hello world".
The tool will create a directory called `my-hello-world` with a Node.js project files.
You can run the project as follows:

```bash
cd my-hello-world
apify run
```

By default, the crawling data will be stored in a local directory at `./apify_storage`.
For example, the input JSON file for the actor is expected to be in the default key-value store
in `./apify_storage/key_value_stores/default/INPUT.json`.

Now you can easily deploy your code to the Apify Cloud by running:

```bash
apify login
apify push
```

Your script will be uploaded to the Apify Cloud and built there so that it can be run.
For more information, view the [Apify CLI](https://www.apify.com/docs/cli)
and [Apify Actor](https://www.apify.com/docs/actor) documentation.


### Usage on the Apify Cloud

You can also develop your web scraping project
in an online code editor directly on the [Apify Cloud](https://www.apify.com/). You'll need to have an Apify Account.
Go to [Actors](https://my.apify.com/actors)
page in the app, click <i>Create new</i> and then go to the
<i>Source</i> tab and start writing your code or paste one of the code examples below.

For more information, view the [Apify actors quick start guide](https://www.apify.com/docs/actor#quick-start).

## What is an "actor"?

When you deploy your script to the [Apify Cloud](https://www.apify.com/), it becomes an actor.
An actor is a serverless microservice that accepts an input and produces an output.
It can run for a few seconds, hours or even infinitely.
An actor can perform anything from a simple action such as filling out a web form or sending an email,
to complex operations such as crawling an entire website and removing duplicates from a large dataset.

To run an actor, you need to have an [Apify Account](https://my.apify.com/).
Actors can be shared in the [Apify Library](https://www.apify.com/library?&type=acts)
so that other people can use them.
But don't worry, if you share your actor in the library
and somebody uses it, it runs under their account, not yours.

**Related links**

* [Library of existing actors](https://www.apify.com/library?&type=acts)
* [Documentation](https://www.apify.com/docs/actor)
* [View actors in Apify app](https://my.apify.com/actors)
* [API reference](https://www.apify.com/docs/api/v2#/reference/actors)

## Examples

An example is better than a thousand words. In the following sections you will find several
examples of how to perform various web scraping and automation tasks using the Apify SDK.
All the examples can be found in the [examples](https://github.com/apifytech/apify-js/tree/master/examples) directory
in the repository.

To run the examples, just copy them into the directory where you installed the Apify SDK using
`npm install apify` and then run them by calling, for example:

```
node basic_crawler.js
```

Note that for production projects you should set either the `APIFY_LOCAL_STORAGE_DIR` or `APIFY_TOKEN` environment variable in order
to tell the SDK how to store its data and crawling state. For details, see
[Environment variables](#environment-variables) and [Data storage](#data-storage).

Alternatively, if you're [using the Apify CLI](#local-usage-with-apify-command-line-interface-cli),
you can copy and paste the source code of each of the examples into the `main.js`
file created by the CLI. Then go to the project directory and run the example using:

```
apify run
```

### Crawl several pages in raw HTML

This is the most basic example of the Apify SDK, which demonstrates some of its
elementary tools, such as the
[BasicCrawler](https://www.apify.com/docs/sdk/apify-runtime-js/latest#BasicCrawler)
and [RequestList](https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestList) classes.
The script just downloads several web pages with plain HTTP requests (using the
[request-promise](https://www.npmjs.com/package/request-promise) library)
and stores their raw HTML and URL to the default dataset.
In local configuration, the data will be stored as JSON files in `./apify_storage/datasets/default`.

```javascript
const Apify = require('apify');
const requestPromise = require('request-promise');

// Apify.main() function wraps the crawler logic (it is optional).
Apify.main(async () => {
    // Create and initialize an instance of the RequestList class that contains
    // a list of URLs to crawl. Here we use just a few hard-coded URLs.
    const requestList = new Apify.RequestList({
        sources: [
            { url: 'http://www.google.com/' },
            { url: 'http://www.example.com/' },
            { url: 'http://www.bing.com/' },
            { url: 'http://www.wikipedia.com/' },
        ],
    });
    await requestList.initialize();

    // Create a BasicCrawler - the simplest crawler that enables
    // users to implement the crawling logic themselves.
    const crawler = new Apify.BasicCrawler({

        // Let the crawler fetch URLs from our list.
        requestList,

        // This function will be called for each URL to crawl.
        // The 'request' option is an instance of the Request class, which contains
        // information such as URL and HTTP method, as supplied by the RequestList.
        handleRequestFunction: async ({ request }) => {
            console.log(`Processing ${request.url}...`);

            // Fetch the page HTML
            const html = await requestPromise(request.url);

            // Store the HTML and URL to the default dataset.
            await Apify.pushData({
                url: request.url,
                html,
            });
        },
    });

    // Run the crawler and wait for it to finish.
    await crawler.run();

    console.log('Crawler finished.');
});
```

### Crawl an external list of URLs with Cheerio

This example demonstrates how to use [CheerioCrawler](https://www.apify.com/docs/sdk/apify-runtime-js/latest#CheerioCrawler)
to crawl a list of URLs from an external file,
load each URL using a plain HTTP request, parse the HTML using [cheerio](https://www.npmjs.com/package/cheerio)
and extract some data from it: the page title and all H1 tags.

```javascript
const Apify = require('apify');

// Apify.utils contains various utilities, e.g. for logging.
// Here we turn off the logging of unimportant messages.
const { log } = Apify.utils;
log.setLevel(log.LEVELS.WARNING);

// A link to a list of Fortune 500 companies' websites available on GitHub.
const CSV_LINK = 'https://gist.githubusercontent.com/hrbrmstr/ae574201af3de035c684/raw/f1000.csv';

// Apify.main() function wraps the crawler logic (it is optional).
Apify.main(async () => {
    // Create an instance of the RequestList class that contains a list of URLs to crawl.
    // Here we download and parse the list of URLs from an external file.
    const requestList = new Apify.RequestList({
        sources: [{ requestsFromUrl: CSV_LINK }],
    });
    await requestList.initialize();

    // Create an instance of the CheerioCrawler class - a crawler
    // that automatically loads the URLs and parses their HTML using the cheerio library.
    const crawler = new Apify.CheerioCrawler({
        // Let the crawler fetch URLs from our list.
        requestList,

        // The crawler downloads and processes the web pages in parallel, with a concurrency
        // automatically managed based on the available system memory and CPU (see AutoscaledPool class).
        // Here we define some hard limits for the concurrency.
        minConcurrency: 10,
        maxConcurrency: 50,

        // On error, retry each page at most once.
        maxRequestRetries: 1,

        // Increase the timeout for processing of each page.
        handlePageTimeoutSecs: 60,

        // This function will be called for each URL to crawl.
        // It accepts a single parameter, which is an object with the following fields:
        // - request: an instance of the Request class with information such as URL and HTTP method
        // - html: contains raw HTML of the page
        // - $: the cheerio object containing parsed HTML
        handlePageFunction: async ({ request, html, $ }) => {
            console.log(`Processing ${request.url}...`);

            // Extract data from the page using cheerio.
            const title = $('title').text();
            const h1texts = [];
            $('h1').each((index, el) => {
                h1texts.push({
                    text: $(el).text(),
                });
            });

            // Store the results to the default dataset. In local configuration,
            // the data will be stored as JSON files in ./apify_storage/datasets/default
            await Apify.pushData({
                url: request.url,
                title,
                h1texts,
                html,
            });
        },

        // This function is called if the page processing failed more than maxRequestRetries+1 times.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed twice.`);
        },
    });

    // Run the crawler and wait for it to finish.
    await crawler.run();

    console.log('Crawler finished.');
});
```

### Recursively crawl a website using Puppeteer

This example demonstrates how to use [PuppeteerCrawler](https://www.apify.com/docs/sdk/apify-runtime-js/latest#PuppeteerCrawler)
in combination with [RequestList](https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestList)
and [RequestQueue](https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestQueue) to recursively scrape the
[Hacker News](https://news.ycombinator.com) website using headless Chrome / Puppeteer.
The crawler starts with a single URL, finds links to next pages,
enqueues them and continues until no more desired links are available.
The results are stored to the default dataset. In local configuration, the results are represented as JSON files in `./apify_storage/datasets/default`

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Create and initialize an instance of the RequestList class that contains the start URL.
    const requestList = new Apify.RequestList({
        sources: [
            { url: 'https://news.ycombinator.com/' },
        ],
    });
    await requestList.initialize();

    // Apify.openRequestQueue() is a factory to get a preconfigured RequestQueue instance.
    const requestQueue = await Apify.openRequestQueue();

    // Create an instance of the PuppeteerCrawler class - a crawler
    // that automatically loads the URLs in headless Chrome / Puppeteer.
    const crawler = new Apify.PuppeteerCrawler({
        // The crawler will first fetch start URLs from the RequestList
        // and then the newly discovered URLs from the RequestQueue
        requestList,
        requestQueue,

        // Run Puppeteer in headless mode. If you set headless to false, you'll see the scraping
        // browsers showing up on your screen. This is great for debugging.
        launchPuppeteerOptions: { headless: true },

        // This function will be called for each URL to crawl.
        // Here you can write the Puppeteer scripts you are familiar with,
        // with the exception that browsers and pages are automatically managed by the Apify SDK.
        // The function accepts a single parameter, which is an object with the following fields:
        // - request: an instance of the Request class with information such as URL and HTTP method
        // - page: Puppeteer's Page object (see https://pptr.dev/#show=api-class-page)
        handlePageFunction: async ({ request, page }) => {
            console.log(`Processing ${request.url}...`);

            // A function to be evaluated by Puppeteer within the browser context.
            const pageFunction = ($posts) => {
                const data = [];

                // We're getting the title, rank and URL of each post on Hacker News.
                $posts.forEach(($post) => {
                    data.push({
                        title: $post.querySelector('.title a').innerText,
                        rank: $post.querySelector('.rank').innerText,
                        href: $post.querySelector('.title a').href,
                    });
                });

                return data;
            };
            const data = await page.$$eval('.athing', pageFunction);

            // Store the results to the default dataset.
            await Apify.pushData(data);

            // Find the link to the next page using Puppeteer functions.
            let nextHref;
            try {
                nextHref = await page.$eval('.morelink', el => el.href);
            } catch (err) {
                console.log(`${request.url} is the last page!`);
                return;
            }

            // Enqueue the link to the RequestQueue
            await requestQueue.addRequest(new Apify.Request({ url: nextHref }));
        },

        // This function is called if the page processing failed more than maxRequestRetries+1 times.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed too many times`);
        },
    });

    // Run the crawler and wait for it to finish.
    await crawler.run();

    console.log('Crawler finished.');
});
```

### Save page screenshots

This example demonstrates how to read and write
data to the default key-value store using
<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#module-Apify-getValue"><code>Apify.getValue()</code></a>
and
<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#module-Apify-setValue"><code>Apify.setValue()</code></a>.
The script crawls a list of URLs using Puppeteer,
captures a screenshot of each page and saves it to the store. The list of URLs is
provided as actor input that is also read from the store.

In local configuration, the input is stored in the default key-value store's directory as a JSON file at
`./apify_storage/key_value_stores/default/INPUT.json`. You need to create the file and set it with the following content:

```json
{ "sources": [{ "url": "https://www.google.com" }, { "url": "https://www.duckduckgo.com" }] }
```

On the Apify Cloud, the input can be either set manually
in the UI app or passed as the POST payload to the [Run actor API call](https://www.apify.com/docs/api/v2#/reference/actors/run-collection/run-actor).
For more details, see [Input and output](https://www.apify.com/docs/actor#input-output)
in the Apify Actor documentation.

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Read the actor input configuration containing the URLs for the screenshot.
    // By convention, the input is present in the actor's default key-value store under the "INPUT" key.
    const input = await Apify.getValue('INPUT');
    if (!input) throw new Error('Have you passed the correct INPUT ?');

    const { sources } = input;

    const requestList = new Apify.RequestList({ sources });
    await requestList.initialize();

    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        handlePageFunction: async ({ page, request }) => {
            console.log(`Processing ${request.url}...`);

            // This is a Puppeteer function that takes a screenshot of the page and returns its buffer.
            const screenshotBuffer = await page.screenshot();

            // The record key may only include the following characters: a-zA-Z0-9!-_.'()
            const key = request.url.replace(/[:/]/g, '_');

            // Save the screenshot. Choosing the right content type will automatically
            // assign the local file the right extension, in this case .png.
            // The screenshots will be stored in ./apify_storage/key_value_stores/default/
            await Apify.setValue(key, screenshotBuffer, { contentType: 'image/png' });
            console.log(`Screenshot of ${request.url} saved.`);
        },
    });

    // Run crawler.
    await crawler.run();

    console.log('Crawler finished.');
});
```

### Open web page in Puppeteer via Apify Proxy

This example demonstrates how to load pages in headless Chrome / Puppeteer
over [Apify Proxy](https://www.apify.com/docs/proxy).
To make it work, you'll need an Apify Account
that has access to the proxy.
The proxy password is available on the [Proxy](https://my.apify.com/proxy) page in the app.
Just set it to the `APIFY_PROXY_PASSWORD` environment variable
or run the script using the CLI.

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Apify.launchPuppeteer() is similar to Puppeteer's launch() function.
    // It accepts the same parameters and returns a preconfigured Puppeteer.Browser instance.
    // Moreover, it accepts several additional options, such as useApifyProxy.
    const options = {
        useApifyProxy: true,
    };
    const browser = await Apify.launchPuppeteer(options);

    console.log('Running Puppeteer script...');

    // Proceed with a plain Puppeteer script.
    const page = await browser.newPage();
    const url = 'https://en.wikipedia.org/wiki/Main_Page';
    await page.goto(url);
    const title = await page.title();

    console.log(`Page title: ${title}`);

    // Cleaning up after yourself is always good.
    await browser.close();
    console.log('Puppeteer closed.');
});
```

### Invoke another actor

This example demonstrates how to start an Apify actor using
<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#module-Apify-call"><code>Apify.call()</code></a>
and how to call Apify API using
<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#module-Apify-client"><code>Apify.client</code></a>.
The script extracts the current Bitcoin prices from Kraken.com
and sends them to your email using the [apify/send-mail](https://www.apify.com/apify/send-mail) actor.

To make the example work, you'll need an [Apify Account](https://my.apify.com/).
Go to [Account - Integrations](https://my.apify.com/account#/integrations) page to obtain your API token
and set it to the `APIFY_TOKEN` environment variable, or run the script using the CLI.
If you deploy this actor to the Apify Cloud then you can set up a scheduler for early
morning. Don't miss the chance of your life to get rich!

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Launch the web browser.
    const browser = await Apify.launchPuppeteer();

    console.log('Obtaining email address...');
    const user = await Apify.client.users.getUser();

    // Load Kraken.com charts and get last traded price of BTC
    console.log('Extracting data from kraken.com...');
    const page = await browser.newPage();
    await page.goto('https://www.kraken.com/charts');
    const tradedPricesHtml = await page.$eval('#ticker-top ul', el => el.outerHTML);

    // Send prices to your email. For that, you can use an actor we already
    // have available on the platform under the name: apify/send-mail.
    // The second parameter to the Apify.call() invocation is the actor's
    // desired input. You can find the required input parameters by checking
    // the actor's documentation page: https://www.apify.com/apify/send-mail
    console.log(`Sending email to ${user.email}...`);
    await Apify.call('apify/send-mail', {
        to: user.email,
        subject: 'Kraken.com BTC',
        html: `<h1>Kraken.com BTC</h1>${tradedPricesHtml}`,
    });

    console.log('Email sent. Good luck!');
});
```

### Use an actor as an API

This example shows a quick actor that has a run time of just a few seconds.
It opens a [web page](http://goldengatebridge75.org/news/webcam.html) that contains a webcam stream from the Golden Gate
Bridge, takes a screenshot of the page and saves it as output.

This actor
can be invoked synchronously using a single HTTP request to directly obtain its output as a reponse,
using the [Run actor synchronously](https://www.apify.com/docs/api/v2#/reference/actors/run-actor-synchronously/without-input)
Apify API endpoint.
The example is also shared as the [apify/example-golden-gate-webcam](https://www.apify.com/apify/example-golden-gate-webcam)
actor in the Apify Library, so you can test it directly there simply by sending a POST request to
https://api.apify.com/v2/acts/apify~example-golden-gate-webcam/run-sync?token=[YOUR_API_TOKEN]

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Launch web browser.
    const browser = await Apify.launchPuppeteer();

    // Load http://goldengatebridge75.org/news/webcam.html and get an IFRAME with the webcam stream
    console.log('Opening web page...');
    const page = await browser.newPage();
    await page.goto('http://goldengatebridge75.org/news/webcam.html');
    const iframe = (await page.frames()).pop();

    // Get webcam image element handle.
    const imageElementHandle = await iframe.$('.VideoColm img');

    // Give the webcam image some time to load.
    console.log('Waiting for page to load...');
    await Apify.utils.sleep(3000);

    // Get a screenshot of that image.
    const imageBuffer = await imageElementHandle.screenshot();
    console.log('Screenshot captured.');

    // Save the screenshot as the actor's output. By convention, similarly to "INPUT",
    // the actor's output is stored in the default key-value store under the "OUTPUT" key.
    await Apify.setValue('OUTPUT', imageBuffer, { contentType: 'image/jpeg' });
    console.log('Actor finished.');
});
```


## Environment variables

The following table shows the basic environment variables used by Apify SDK:

<table class="table table-bordered table-condensed">
    <thead>
        <tr>
            <th>Environment variable</th>
            <th>Description</th>
        </tr>
    </thead>
    <tbody>
          <tr>
            <td><code>APIFY_LOCAL_STORAGE_DIR</code></td>
            <td>
              Defines the path to a local directory where
              <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#KeyValueStore">key-value stores</a>,
              <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestList">request lists</a>
              and <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestQueue">request queues</a> store their data.
              Typically it is set to <code>./apify_storage</code>.
              If omitted, you should define
              the <code>APIFY_TOKEN</code> environment variable instead.
            </td>
          </tr>
          <tr>
            <td><code>APIFY_TOKEN</code></td>
            <td>
              The API token for your Apify Account. It is used to access the Apify API, e.g. to access cloud storage or to run an actor in the Apify Cloud.
              You can find your API token on the <a href="https://my.apify.com/account#intergrations">Account - Integrations</a> page.
              If omitted, you should define the <code>APIFY_LOCAL_STORAGE_DIR</code> environment variable instead.
            </td>
          </tr>
          <tr>
            <td><code>APIFY_PROXY_PASSWORD</code></td>
            <td>
              Optional password to <a href="https://www.apify.com/docs/proxy">Apify Proxy</a> for IP address rotation.
              If you have have an Apify Account, you can find the password on the
              <a href="https://my.apify.com/proxy">Proxy page</a> in the Apify app.
              This feature is optional. You can use your own proxies or no proxies at all.
            </td>
          </tr>
          <tr>
              <td><code>APIFY_HEADLESS</code></td>
              <td>
                If set to <code>1</code>, web browsers launched by Apify SDK will run in the headless
                mode. You can still override this setting in the code, e.g. by
                passing the <code>headless: true</code> option to the
                <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#module-Apify-launchPuppeteer"><code>Apify.launchPuppeteer()</code></a>
                function. But having this setting in an environment variable allows you to develop
                the crawler locally in headful mode to simplify the debugging, and only run the crawler in headless
                mode once you deploy it to the Apify Cloud.
                By default, the browsers are launched in headful mode, i.e. with windows.
              </td>
          </tr>
          <tr>
              <td><code>APIFY_LOG_LEVEL</code></td>
              <td>
                Specifies the minimum log level, which can be one of the following values (in order of severity):
                <code>DEBUG</code>, <code>INFO</code>, <code>WARNING</code>, <code>SOFT_FAIL</code> and <code>ERROR</code>.
                By default, the log level is set to <code>INFO</code>, which means that <code>DEBUG</code> messages
                are not printed to console.
              </td>
          </tr>
          <tr>
              <td><code>APIFY_MEMORY_MBYTES</code></td>
              <td>
                Sets the amount of system memory in megabytes to be used by the
                <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#AutoscaledPool">autoscaled pool</a>.
                It is used to limit the number of concurrently running tasks. By default, the max amount of memory
                to be used is set to one quarter of total system memory, i. e. on a system with 8192 MB of memory,
                the autoscaling feature will only use up to 2048 MB of memory.
              </td>
          </tr>
    </tbody>
</table>

For the full list of environment variables used by Apify SDK and the Apify Cloud, please see the
[Environment variables](https://www.apify.com/docs/actor#run-env-vars)
in the Apify actor documentation.


## Data storage

The Apify SDK has several data storage types that are useful for specific tasks.
The data is stored either on local disk to a directory defined by the `APIFY_LOCAL_STORAGE_DIR` environment variable,
or on the Apify Cloud under the user account identified by the API token defined by the `APIFY_TOKEN` environment variable.
If neither of these variables is defined, by default Apify SDK sets `APIFY_LOCAL_STORAGE_DIR`
to `./apify_storage` in the current working directory and prints a warning.

Typically, you will be developing the code on your local computer and thus set the `APIFY_LOCAL_STORAGE_DIR` environment variable.
Once the code is ready, you will deploy it to the Apify Cloud, where it will automatically
set the `APIFY_TOKEN` environment variable and thus use cloud storage.
No code changes are needed.

**Related links**

* [Apify cloud storage documentation](https://www.apify.com/docs/storage)
* [View storage in Apify app](https://my.apify.com/storage)
* [API reference](https://www.apify.com/docs/api/v2#/reference/key-value-stores)

### Key-value store

The key-value store is used for saving and reading data records or files.
Each data record is represented by a unique key and associated with a MIME content type.
Key-value stores are ideal for saving screenshots of web pages, PDFs or to persist the state of crawlers.

Each actor run is associated with a **default key-value store**, which is created exclusively for the actor run.
By convention, the actor run input and output is stored in the default key-value store
under the `INPUT` and `OUTPUT` key, respectively. Typically the input and output is a JSON file,
although it can be any other format.

In the Apify SDK, the key-value store is represented by the
<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#KeyValueStore"><code>KeyValueStore</code></a>
class.
In order to simplify access to the default key-value store, the SDK also provides
<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#module-Apify-getValue"><code>Apify.getValue()</code></a>
and <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#module-Apify-setValue"><code>Apify.setValue()</code></a> functions.

In local configuration, the data is stored in the directory specified by the `APIFY_LOCAL_STORAGE_DIR` environment variable as follows:

```
[APIFY_LOCAL_STORAGE_DIR]/key_value_stores/[STORE_ID]/[KEY].[EXT]
```

Note that `[STORE_ID]` is the name or ID of the key-value store.
The default key value store has ID `default`, unless you override it by setting the `APIFY_DEFAULT_KEY_VALUE_STORE_ID`
environment variable.
The `[KEY]` is the key of the record and <code>[EXT]</code> corresponds to the MIME content type of the
data value.

The following code demonstrates basic operations of key-value stores:

```javascript
// Get actor input from the default key-value store
const input = await Apify.getValue('INPUT');

// Write actor output to the default key-value store.
await Apify.setValue('OUTPUT', { myResult: 123 });

// Open a named key-value store
const store = await Apify.openKeyValueStore('some-name');

// Write record. JavaScript object is automatically converted to JSON,
// strings and binary buffers are stored as they are
await store.setValue('some-key', { foo: 'bar' });

// Read record. Note that JSON is automatically parsed to a JavaScript object,
// text data returned as a string and other data is returned as binary buffer
const value = await store.getValue('some-key');

// Delete record
await store.delete('some-key');
```

To see a real-world example of how to get the input from the key-value store, see the
[screenshots.js](https://github.com/apifytech/apify-js/blob/master/examples/screenshots.js) example.


### Dataset

Datasets are used to store structured data
where each object stored has the same attributes, such as online store products or real estate offers.
You can imagine a dataset as a table, where each object is a row and its attributes are columns.
Dataset is an append-only storage - you can only add new records to it but you cannot modify or remove
existing records.

When the dataset is stored in the Apify Cloud,
you can export its data to the following formats: HTML, JSON, CSV, Excel, XML and RSS.
The datasets are displayed on the actor run details page and in the [Storage](https://my.apify.com/storage)
section in the Apify app. The actual data is exported using the
[Get dataset items](https://www.apify.com/docs/api/v2#/reference/datasets/item-collection/get-items) Apify API endpoint.
This way you can easily share crawling results.

Each actor run is associated with a **default dataset**, which is created exclusively for the actor run.
Typically, it is used to store crawling results specific for the actor run. Its usage is optional.

In the Apify SDK, the dataset is represented by the
<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#Dataset"><code>Dataset</code></a>
class.
In order to simplify writes to the default dataset, the SDK also provides the
<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#module-Apify-pushData"><code>Apify.pushData()</code></a> function.

In local configuration, the data is stored in the directory specified by the `APIFY_LOCAL_STORAGE_DIR` environment variable as follows:

```
[APIFY_LOCAL_STORAGE_DIR]/datasets/[DATASET_ID]/[INDEX].json
```

Note that `[DATASET_ID]` is the name or ID of the dataset.
The default dataset has ID `default`, unless you override it by setting the `APIFY_DEFAULT_DATASET_ID`
environment variable.
Each dataset item is stored as a separate JSON file,
where <code>[INDEX]</code> is a zero-based index of the item in the dataset.

The following code demonstrates basic operations of the dataset:

```javascript
// Write a single row to the default dataset
await Apify.pushData({ col1: 123, col2: 'val2' });

// Open a named dataset
const dataset = await Apify.openDataset('some-name');

// Write a single row
await dataset.pushData({ foo: 'bar' });

// Write multiple rows
await dataset.pushData([
  { foo: 'bar2', col2: 'val2' },
  { col3: 123 },
]);
```

To see how to use the dataset to store crawler results, see the
[cheerio_crawler.js](https://github.com/apifytech/apify-js/blob/master/examples/cheerio_crawler.js) example.


### Request queue

The request queue is a storage of URLs to crawl.
The queue is used for the deep crawling of websites, where you start with
several URLs and then recursively follow links to other pages.
The data structure supports both breadth-first and depth-first crawling orders.

Each actor run is associated with a **default request queue**, which is created exclusively for the actor run.
Typically, it is used to store URLs to crawl in the specific actor run. Its usage is optional.

In Apify SDK, the request queue is represented by the
<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestQueue"><code>RequestQueue</code></a>
class.

In local configuration, the request queue data is stored in the directory specified by the `APIFY_LOCAL_STORAGE_DIR` environment variable as follows:

```
[APIFY_LOCAL_STORAGE_DIR]/request_queues/[QUEUE_ID]/[STATE]/[NUMBER].json
```

Note that `[QUEUE_ID]` is the name or ID of the request queue.
The default queue has ID `default`, unless you override it by setting the `APIFY_DEFAULT_REQUEST_QUEUE_ID`
environment variable.
Each request in the queue is stored as a separate JSON file,
where `[STATE]` is either `handled` or `pending`,
and <code>[NUMBER]</code> is an integer indicating the position of the request in the queue.

The following code demonstrates basic operations of the request queue:

```javascript
// Open the default request queue associated with the actor run
const queue = await Apify.openRequestQueue();

// Open a named request queue
const queueWithName = await Apify.openRequestQueue('some-name');

// Enqueue few requests
await queue.addRequest(new Apify.Request({ url: 'http://example.com/aaa'}));
await queue.addRequest(new Apify.Request({ url: 'http://example.com/bbb'}));
await queue.addRequest(new Apify.Request({ url: 'http://example.com/foo/bar'}), { forefront: true });

// Get requests from queue
const request1 = await queue.fetchNextRequest();
const request2 = await queue.fetchNextRequest();
const request3 = await queue.fetchNextRequest();

// Mark a request as handled
await queue.markRequestHandled(request1);

// If processing fails then reclaim the request back to the queue, so that it's crawled again
await queue.reclaimRequest(request2);
```

To see how to use the request queue with a crawler, see the
[puppeteer_crawler.js](https://github.com/apifytech/apify-js/blob/master/examples/puppeteer_crawler.js) example.


## Puppeteer live view

Apify SDK enables the real-time view of launched Puppeteer browser instances and their open tabs,
including screenshots of pages and snapshots of HTML.
This is useful for debugging your crawlers that run in headless mode.

The live view dashboard is run on a web server that is started on a port specified
by the `APIFY_CONTAINER_PORT` environment variable (typically 4321).
To enable live view, pass the `liveView: true` option to
<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#module-Apify-launchPuppeteer" target="_blank"><code>Apify.launchPuppeteer()</code></a>:

```javascript
const browser = Apify.launchPuppeteer({ liveView: true });
```

or to `PuppeteerCrawler` constructor as follows:

```javascript
const crawler = new PuppeteerCrawler({
    launchPuppeteerOptions: { liveView: true },
    // other options
})
```

To simplify debugging, you may also want to add the
`{ slowMo: 300 }` option to slow down all browser operation.
See <a href="https://pptr.dev/#?product=Puppeteer&version=v1.6.0&show=api-puppeteerlaunchoptions" target="_blank">Puppeteer documentation</a> for details.

Once live view is enabled, you can open http://localhost:4321 and you will see a page like this:

<p style="text-align:center" align="center">
  <img src="https://www.apify.com/ext/sdk_assets/puppeteer-live-view-dashboard.png" width="600">
</p>

Click on the magnifying glass icon to view page detail, showing page screenshot and raw HTML:

<p style="text-align:center" align="center">
  <img src="https://www.apify.com/ext/sdk_assets/puppeteer-live-view-detail.png" width="600">
</p>

For more information, read the <a href="https://kb.apify.com/actor/debugging-your-actors-with-live-view" target="_blank">Debugging your actors with Live View</a>
article in Apify Knowlege Base.

## Support

If you find any bug or issue with the Apify SDK, please [submit an issue on GitHub](https://github.com/apifytech/apify-js/issues).
For questions, you can ask on [Stack Overflow](https://stackoverflow.com/questions/tagged/apify) or contact support@apify.com

## Contributing

Your code contributions are welcome and you'll be praised to eternity!
If you have any ideas for improvements, either submit an issue or create a pull request.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE.md](LICENSE.md) file for details.

## Acknowledgments

Many thanks to [Chema Balsas](https://www.npmjs.com/~jbalsas) for giving up the `apify` package name
on NPM and renaming his project to [jsdocify](https://www.npmjs.com/package/jsdocify).



</div>

<div id="include-readme-3">
</div>
