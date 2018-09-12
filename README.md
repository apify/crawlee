# Apify SDK: The web scraping and automation library for Node.js
<!-- Mirror this part to src/index.js -->

[![npm version](https://badge.fury.io/js/apify.svg)](https://www.npmjs.com/package/apify)
[![Build Status](https://travis-ci.org/apifytech/apify-js.svg?branch=master)](https://travis-ci.org/apifytech/apify-js)

<div id="include-readme-1">
  Apify SDK simplifies development of web crawlers, scrapers, data extractors and web automation jobs.
  It provides tools to manage and automatically scale a pool of headless Chrome / Puppeteer instances,
  to maintain queues of URLs to crawl, store crawling results to local filesystem or into the cloud,
  rotate proxies and much more.
  The SDK is available as the <a href="https://www.npmjs.com/package/apify" target="_blank"><code>apify</code></a> NPM package.
  It can be used either standalone in your own applications
  or in <a href="https://www.apify.com/docs/actor" target="_blank">actors</a>
  running on the <a href="https://www.apify.com/" target="_blank">Apify cloud platform</a>.
</div>

<br>

<div>
  View the full <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest/" target="_blank">Apify SDK Programmer's Reference</a>.
</div>


## Table of Content

<!-- toc -->

- [Motivation](#motivation)
- [Overview](#overview)
- [Getting started](#getting-started)
  * [Local standalone usage](#local-standalone-usage)
  * [Local usage with Apify command-line interface (CLI)](#local-usage-with-apify-command-line-interface-cli)
  * [Usage in actors on the Apify cloud platform](#usage-in-actors-on-the-apify-cloud-platform)
- [Examples](#examples)
  * [Load a few pages in raw HTML](#load-a-few-pages-in-raw-html)
  * [Crawl a large list of URLs with Cheerio](#crawl-a-large-list-of-urls-with-cheerio)
  * [Recursively crawl a website using headless Chrome / Puppeteer](#recursively-crawl-a-website-using-headless-chrome--puppeteer)
  * [Save page screenshots into KeyValueStore](#save-page-screenshots-into-keyvaluestore)
  * [Run Puppeteer with Apify Proxy](#run-puppeteer-with-apify-proxy)
  * [Invoke another actor](#invoke-another-actor)
  * [Run actor as an API](#run-actor-as-an-api)
- [Data storage](#data-storage)
- [Puppeteer live view](#puppeteer-live-view)
- [Support](#support)
- [Contributing](#contributing)

<!-- tocstop -->

<div id="include-readme-2">

## Motivation
<!-- Mirror this part to src/index.js -->

Thanks to tools like <a href="https://github.com/GoogleChrome/puppeteer" target="_blank" rel="noopener">Puppeteer</a> or
<a href="https://www.npmjs.com/package/cheerio" target="_blank">cheerio</a>
it is very easy to write a Node.js code to extract data from web pages.
But eventually things will get complicated, for example when you try to:

* Perform a deep crawl of an entire website using a persistent queue of URLs.
* Run your scraping code on a list of 100k URLs in a CSV file,
  without losing any data when your code crashes.
* Rotate proxies to hide your browser origin.
* Schedule the code to run periodically and send notification on errors.
* Disable browser fingerprinting protections used by websites.
* ...

The goal of Apify SDK package is to provide a toolbox
for these generic web scraping and crawling tasks.
Don't reinvent the wheel every time you need data from the web,
and focus on writing the code specific to the target website, rather than developing commonalities.

## Overview

The Apify SDK is available as the <a href="https://www.npmjs.com/package/apify"><code>apify</code></a> NPM package and it provides the following tools:

<ul>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#BasicCrawler">BasicCrawler</a>
    - Provides a simple framework for parallel crawling of web pages,
    whose URLs are fed either from a static list or from a dynamic queue of URLs.
    This class serves as a base for more complex crawlers (see below).
  </li>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#CheerioCrawler">CheerioCrawler</a>
    - Enables parallel crawling of large number of web pages
    using <a href="https://www.npmjs.com/package/cheerio" target="_blank">cheerio</a>
    HTML parser.
    This is the most efficient web crawler, but it does not work on websites that require JavaScript.
  </li>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#PuppeteerCrawler">PuppeteerCrawler</a>
    - Enables parallel crawling of large number of web pages using headless Chrome browser
    and <a href="https://github.com/GoogleChrome/puppeteer">Puppeteer</a>.
    The pool of Chrome processes is automatically scaled up and down based on available system resources.
  </li>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#PuppeteerPool">PuppeteerPool</a>
    - Provides web browser tabs for user jobs
    from an automatically-managed pool of Chrome browser instances, with configurable browser recycling and retirement policies.
    Supports reuse of the disk cache to speed up crawling of websites and reduce proxy bandwidth.
  </li>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestList">RequestList</a>
    - Represents a list of URLs to crawl. The URLs can be passed in code or in a text file hosted on the web.
    The list persists its state so that the crawling can resume
    when the Node.js process restarts.
  </li>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestQueue">RequestQueue</a>
    - Represents a queue of URLs to crawl, which is stored either on local filesystem or in the cloud.
    The queue is used for deep crawling of websites, where you start with
    several URLs and then recursively follow links to other pages.
    The data structure supports both breadth-first and depth-first crawling orders.
  </li>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#Dataset">Dataset</a>
    - Provides a store for structured data and enables their
    export to formats like JSON, JSONL, CSV, Excel or HTML.
    The data is stored on local filesystem or in the cloud.
    Datasets are useful for storing and sharing large tabular crawling results,
    like list of products or real estate offers.
  </li>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#KeyValueStore">KeyValueStore</a>
    - A simple key-value store for arbitrary data records or files, along with their MIME content type.
    It is ideal for saving screenshots of web pages, PDFs or to persist state of your crawlers.
    The data is stored on local filesystem or in the cloud.
  </li>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#AutoscaledPool" target="_blank">AutoscaledPool</a>
    - Runs asynchronous background tasks, while automatically adjusting the concurrency
    based on free system memory and CPU usage. This is useful for running headless Chrome or cheerio tasks at scale.
  </li>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#PuppeteerUtils" target="_blank">PuppeteerUtils</a>
    - Provides several helper functions useful for web scraping. For example, to inject jQuery to the web pages
    or to hide browser origin.
  </li>
  <li>
    Additionally, the package provides various helper functions to simplify
    running your code on the Apify cloud platform and thus
    get advantage of pool of proxies, job scheduler, data storage etc.
    For more information,
    see the <a href="https://www.apify.com/docs/actor">Apify actor documentation</a>.
  </li>
</ul>


## Getting started

The Apify SDK requires <a href="https://nodejs.org/en/" target="_blank">Node.js</a> 8 or later.

### Local stand-alone usage

Add Apify SDK to any Node.js project by running:

```bash
npm install apify
```

Then you'll need to specify where the SDK should store the data.
Either define the `APIFY_LOCAL_STORAGE_DIR` environment variable to store the data locally on your disk
or define `APIFY_TOKEN` to store the data to Apify cloud platform.

Here's the table of basic environment variables used by Apify SDK:

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
              If omitted, you should define
              the <code>APIFY_TOKEN</code> environment variable instead.
            </td>
          </tr>
          <tr>
            <td><code>APIFY_TOKEN</code></td>
            <td>
              The API token for your Apify account. It is used to access Apify API, e.g. to access cloud storage or to run an actor in the cloud.
              You can find your API token on the <a href="https://my.apify.com/account#intergrations">Account - Integrations</a> page.
              If omitted, you should define the <code>APIFY_LOCAL_STORAGE_DIR</code> environment variable instead.
            </td>
          </tr>
          <tr>
            <td><code>APIFY_PROXY_PASSWORD</code></td>
            <td>
              Password to <a href="https://www.apify.com/docs/proxy" target="_blank">Apify Proxy</a> for IP address rotation.
              If you have have an Apify account, you can find the password on the
              <a href="https://my.apify.com/proxy" target="_blank">Proxy page</a> in the Apify app.
              This feature is optional. You can use your own proxies or no proxies at all, instead of the Apify pool.
            </td>
          </tr>
    </tbody>
</table>


For the full list of environment variables used by Apify SDK and the Apify cloud platform, please see the
<a href="https://www.apify.com/docs/actor#environment-variabes" target="_blank">Environment variables</a>
in the Apify actor documentation.


### Local usage with Apify command-line interface (CLI)

To avoid the need to set the necessary environment variables manually,
to create a boilerplate of your project,
and to enable pushing and running your code on the Apify cloud,
you can take advantage of the
<a href="https://github.com/apifytech/apify-cli" target="_blank">Apify command-line interface</a> (CLI) tool.

Install the CLI by running:

```bash
npm -g install apify-cli
```

Create a boilerplate of you new web crawling project by running:

```bash
apify create my-hello-world
```

The CLI will prompt you to select a project template and then it creates a
directory called `my-hello-world` with a Node.js project files.
You can run the project as follows:

```bash
cd my-hello-world
apify run
```

By default, the crawling data will be stored to the local storage directory at `./apify_storage`
(using the `APIFY_LOCAL_STORAGE_DIR` environment variable).
For example, the input JSON file for the actor is expected to be in the default key-value store
in `./apify_storage/key_value_stores/default/INPUT.json`.

Now you can easily deploy your code to Apify cloud by running:

```bash
apify login
apify push
```

Your actor will be uploaded to Apify cloud and built there.
For more information, view the [Apify CLI](https://www.apify.com/docs/cli)
and [Apify Actor](https://www.apify.com/docs/actor) documentation.


### Usage in actors on the Apify cloud platform

You can also develop your web scraping project
directly in IDE on Apify platform. Go to [Actors](https://my.apify.com/actors)
page in the app, click <b>Create new</b> and then go to
<b>Source</b> tab and start writing your code. It's that simple.

For more information, view the [Apify actors quick start guide](https://www.apify.com/docs/actor#quick-start).


## Examples

An example is better than thousand of words. In the following sections you will find several
examples how to solve various web scraping task using Apify SDK.
All the examples can be found in the [examples](https://github.com/apifytech/apify-js/tree/master/examples) directory
in the repository.

To run the examples, just copy them into the directory where you installed Apify SDK using
`npm install apify` and then run them by:

```
node APIFY_LOCAL_STORAGE_DIR=./apify_storage 1_basic_crawler.js
```

Note that it is necessary to set the `APIFY_LOCAL_STORAGE_DIR` environment variables in order
to tell the SDK where to store its data and crawling state.

Alternatively, if you're using the [Apify CLI](#local-usage-with-apify-command-line-interface-cli),
you can copy and paste the source code of each of the examples into the `main.js`
file created by the CLI, go to the project's directory and then run

```
apify run
```

### Load a few pages in raw HTML

This is the most basic example of Apify SDK that demonstrates some of its
elementary concepts, such as the
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

            // Store the HTML and URL to the default dataset
            await Apify.pushData({
                url: request.url,
                html,
            });
        },
    });

    // Run the crawler and wait for its finish.
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
// Here we turn off logging of unimportant messages.
Apify.utils.log.setLevel(log.LEVELS.WARNING);

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
    // that automatically loads the URLs and parses their HTML using cheerio library.
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

    // Run the crawler and wait for its finish.
    await crawler.run();

    console.log('Crawler finished.');
});
```

### Recursively crawl a website using Puppeteer

This example demonstrates how to use [PuppeteerCrawler](https://www.apify.com/docs/sdk/apify-runtime-js/latest#PuppeteerCrawler)
in combination with [RequestList](https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestList)
and [RequestQueue](https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestQueue) to recursively scrape
Hacker News website (https://news.ycombinator.com) using headless Chrome / Puppeteer.
The crawlers starts with a single URL, finds links to next pages,
enqueues them and continues until no more desired links are available.
The results are stored to the default dataset. In local configuration, the results are stored as JSON files in ``./apify_storage/datasets/default`

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Create and initialize an instance of the RequestList class that contains the start URL
    const requestList = new Apify.RequestList({
        sources: [
            { url: 'http://www.ycombinator.com/' },
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

        // Run Puppeteer in headless mode. If you headless to false, you'll see the scraping
        // browsers showing up on your screen. This is great for debugging.
        launchPuppeteerOptions: { headless: true },

        // This function will be called for each URL to crawl.
        // Here you can write the Puppeteer scripts you are familiar with,
        // with the exception that browsers and pages are automatically managed by Apify SDK.
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

            // Find the link to the next page using Puppeteer functions
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

    // Run the crawler and wait for its finish.
    await crawler.run();

    console.log('Crawler finished.');
});
```

### Save page screenshots

This example shows how to read and write
data to the default key-value store using
<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#module-Apify-getValue"><code>Apify.getValue()</code></a>
and
<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#module-Apify-setValue"><code>Apify.setValue()</code></a>.
The script crawls a list of URLs using Puppeteer,
captures a screenshot of each page and saves it to the store. The list of URLs is
provided as actor input that is also read from the store.

Locally, the input is stored in the default key-value store's directory as JSON file at
`./apify_storage/key_value_stores/default/INPUT.json`. You can create the file and set it the following content:

```json
{ "sources": [{ "url": "https://www.google.com" }, { "url": "https://www.duckduckgo.com" }] }
```

On the Apify cloud platform, the input can be either set manually
in the UI app or passed as the POST payload to the [Run actor API call](https://www.apify.com/docs/api/v2#/reference/actors/run-collection/run-actor).
For more details, see [Input and output](https://www.apify.com/docs/actor#input-output)
in the Apify Actor documentation.

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Read the actor input configuration containing URLs to take the screenshot off.
    // By convention, the input is present in actor's default key-value store under the "INPUT" key.
    const { sources } = await Apify.getValue('INPUT');

    const requestList = new Apify.RequestList({ sources });
    await requestList.initialize();

    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        launchPuppeteerOptions: { headless: true },
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

### Open page in Puppeteer via Apify Proxy

This example demonstrates how to load pages in headless Chrome / Puppeteer
over [Apify Proxy](https://www.apify.com/docs/proxy).
To make it work, you'll need an [Apify Account](https://my.apify.com/proxy)
that has access to the proxy.
Set the Apify Proxy password to the `APIFY_PROXY_PASSWORD` environment variable,
or run the script using the CLI.

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Apify.launchPuppeteer() is similar to Puppeteer's launch() function.
    // It accepts the same parameters and returns a preconfigured Puppeteer.Browser instance.
    // Moreover, it accepts several additional options, such as useApifyProxy.
    const options = {
        useApifyProxy: true,
        headless: true,
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

This example shows how to call an Apify actor from another actor using
<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#module-Apify-call"><code>Apify.call()</code></a>,
and how to call Apify API using
<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#module-Apify-client"><code>Apify.client</code></a>.
The script extracts the current Bitcoin prices from Kraken.com
and sends them to your email using the [apify/send-mail](https://www.apify.com/apify/send-mail) actor.

To make it work, you'll need an [Apify Account](https://my.apify.com/).
Set your Apify API token (shown on [Account - Integrations](https://my.apify.com/account#/integrations) page)
as the `APIFY_TOKEN` environment variable, or run the script using the CLI.
If you deploy this actor to Apify platform then you can setup a scheduler for early
morning. Don't miss the chance of your life to get rich!

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Launch the web browser.
    const browser = await Apify.launchPuppeteer({ headless: true });

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

    console.log('Email was sent. Good luck!');
});
```

### Run actor as an API

This example shows shows a quick actor that has a run time of just a few seconds. It opens a web page
http://goldengatebridge75.org/news/webcam.html that contains webcam stream from the Golden Gate
bridge, takes a screenshot and saves it as output. This makes the actor runnable on Apify platform
synchronously with a single request that also returns its output,
using the [Run actor synchronously](https://www.apify.com/docs/api/v2#/reference/actors/run-actor-synchronously/without-input)
API endpoint.

The example is also shared as the [apify/example-golden-gate-webcam](https://www.apify.com/apify/example-golden-gate-webcam)
actor in the Apify library, so you can run it without any setup by sending a POST request to
https://api.apify.com/v2/acts/apify~example-golden-gate-webcam/run-sync?token=[YOUR_API_TOKEN]

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Launch web browser.
    const browser = await Apify.launchPuppeteer({ headless: true });

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

    // Save the screenshot as actor's output. By convention, similarly to "INPUT",
    // the actor's output is stored in the default key-value store under the "OUTPUT" key.
    await Apify.setValue('OUTPUT', imageBuffer, { contentType: 'image/jpeg' });
    console.log('Actor finished.');
});
```

## Data storage

Each actor run at Apify platform has assigned its default storages
(<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#KeyValueStore">key-value store</a>,
<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestQueue">request queue</a> and
<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#Dataset">dataset</a>) which are available
via API and helper functions such as `Apify.setValue()`, `Apify.pushData()`, etc.. If you are running actor locally then the data
get stored in the directory defined by <code>APIFY_LOCAL_STORAGE_DIR</code> environment variable and its subdirectories based on
following environment variables:

<table>
  <thead>
    <tr>
      <th>Environment variable</th>
      <th>Default value</th>
      <th>Description</th>
  </thead>
  <tbody>
    <tr>
       <td><code>APIFY_DEFAULT_KEY_VALUE_STORE_ID</code></td>
       <td><code>default</code></td>
       <td>
           ID of the default key-value store, where the
           <code>Apify.getValue()</code> or <code>Apify.setValue()</code> functions store the values.
           If you defined <code>APIFY_LOCAL_STORAGE_DIR</code>, then each value is stored as a file at
           <code>[APIFY_LOCAL_STORAGE_DIR]/key_value_stores/[APIFY_DEFAULT_KEY_VALUE_STORE_ID]/[KEY].[EXT]</code>,
           where <code>[KEY]</code> is the key nad <code>[EXT]</code> corresponds to the MIME content type of the
           value.
       </td>
    </tr>
    <tr>
       <td><code>APIFY_DEFAULT_DATASET_ID</code></td>
       <td><code>default</code></td>
       <td>
           ID of the default dataset, where the <code>Apify.pushData()</code> function store the data.
           If you defined <code>APIFY_LOCAL_STORAGE_DIR</code>, then dataset items are stored as files at
           <code>[APIFY_LOCAL_STORAGE_DIR]/datasets/[APIFY_DEFAULT_DATASET_ID]/[INDEX].json</code>,
           where <code>[INDEX]</code> is a zero-based index of the item.
       </td>
     </tr>
     <tr>
       <td><code>APIFY_DEFAULT_REQUEST_QUEUE_ID</code></td>
       <td><code>default</code></td>
       <td>
           ID of the default request queue (request queue opened using <code>Apify.openRequestQueue()</code> function).
           If you defined <code>APIFY_LOCAL_STORAGE_DIR</code>, then request queue records are stored as files at
           <code>[APIFY_LOCAL_STORAGE_DIR]/request_queues/[APIFY_DEFAULT_REQUEST_QUEUE_ID]/[INDEX].json</code>,
           where <code>[INDEX]</code> is a zero-based index of the item.
       </td>
     </tr>
   </tbody>
 </table>

## Puppeteer live view

Apify SDK enables real-time view of launched Puppeteer browser instances and their open tabs,
including screenshots of the pages and snapshots of HTML.
This is useful for debugging your crawlers that run in headless mode.

The live view dashboard is run on a web server that is started on a port specified
by the `APIFY_CONTAINER_PORT` environment variable (typically 4321).
To enable the live view, pass the `liveView: true` option to
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

Once the live view is enabled, you can open http://localhost:4321 and you will see a page like this:

<img src="https://www.apify.com/ext/sdk_assets/puppeteer-live-view-dashboard.png" width="600p">

Click on the magnifying glass icon to view a page detail, showing page screenshot and raw HTML:

<img src="https://www.apify.com/ext/sdk_assets/puppeteer-live-view-detail.png" width="600p">

For more information, read the <a href="https://kb.apify.com/actor/debugging-your-actors-with-live-view" target="_blank">Debugging your actors with Live View</a>
article in Apify Knowlege base.

## Support

If you find any bug or issue with Apify SDK, please [submit an issue on GitHub](https://github.com/apifytech/apify-js/issues).
For questions, you can ask on [Stack Overflow](https://stackoverflow.com/questions/tagged/apify) or contact support@apify.com

## Contributing

Your code contributions are welcome and you'll praised to the eternity!
If you have any ideas for improvements, either submit an issue or create a pull request.

</div>

<div id="include-readme-3">
</div>
