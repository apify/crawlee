# Apify SDK: The web scraping and automation library for Node.js
<!-- Mirror this part to src/index.js -->

[![npm version](https://badge.fury.io/js/apify.svg)](http://badge.fury.io/js/apify)
[![Build Status](https://travis-ci.org/apifytech/apify-js.svg)](https://travis-ci.org/apifytech/apify-js)

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
  View the full <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest/" target="_blank">Apify SDK Programmer's Reference</a> on a separate website.
</div>


## Table of Content

<!-- toc -->

- [Use cases](#use-cases)
- [Quick start](#quick-start)
- [Puppeteer](#puppeteer)
- [Components](#components)
  * [Storage](#storage)
    + [Key-value store](#key-value-store)
    + [Dataset](#dataset)
    + [Request queue](#request-queue)
  * [Helper Classes](#helper-classes)
    + [Autoscaled Pool](#autoscaled-pool)
    + [Basic Crawler](#basic-crawler)
    + [Puppeteer Crawler](#puppeteer-crawler)
    + [Request List](#request-list)
    + [Puppeteer Pool](#puppeteer-pool)
    + [Puppeteer Live View](#puppeteer-live-view)
- [Local usage](#local-usage)
- [Promises vs. callbacks](#promises-vs-callbacks)
- [Examples](#examples)
  * [Recursive crawling](#recursive-crawling)
  * [Crawling url list](#crawling-url-list)
  * [Call to another actor](#call-to-another-actor)
  * [Actor used and synchronous API](#actor-used-and-synchronous-api)
  * [Other](#other)

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
  without loosing any data when your code crashes.
* Rotate proxies to hide your browser origin.
* Schedule the code to run periodically and send notification on errors.
* Disable browser fingerprinting protections used by websites.
* ...

The goal of Apify SDK package is to provide a toolbox
for these generic web scraping and crawling tasks.
Don't reinvent the wheel every time you need data from the web,
and focus on writing the code specific to the target website, rather than developing commonalities.

## Overview

The Apify SDK package provides the following tools:

<ul>
  <li>
     <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#BasicCrawler">BasicCrawler</a>
     - Enables crawling of large number of web pages
     in raw HTML or using <a href="https://www.npmjs.com/package/cheerio" target="_blank">cheerio</a>
     HTML parser.
     This is the most efficient web crawling method, but it does not work on websites that require JavaScript.
  </li>
  <li>
     <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#PuppeteerCrawler">PuppeteerCrawler</a>
     - Enables crawling of large number of web pages using headless Chrome browser
     and <a href="https://github.com/GoogleChrome/puppeteer">Puppeteer</a>.
     The pool of Chrome processes is automatically scaled up and down based on available system resources.
    </li>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestList">RequestList</a>
    - Represents a list of URLs to crawl. The URLs can be provided in code or in a text file.
    The list persists its state so that the crawling can resume
    when the Node.js process restarts.
  </li>
  <li>
     <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestQueue">RequestQueue</a>
     - Represents a queue of URLs to crawl, which is stored either on local filesystem or in cloud.
     The queue is used for deep crawling of websites, where you start with
     several URLs and then recursively follow links to other pages.
     The data structure supports both breath-first and depth-first crawling orders.
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
     <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#Dataset">KeyValueStore</a>
     - A simple key-value store for arbitrary data records or files, along with their MIME content type.
     It is ideal for saving screenshots of web pages, PDFs or any downloaded files.
     The data is stored on local filesystem or in the cloud.
  </li>
  <li>
     <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#AutoscaledPool" target="_blank">AutoscaledPool</a>
     - Runs asynchronous background tasks, while automatically adjusting the concurrency
     based on free system memory and CPU usage. This is useful for running headless Chrome tasks at scale.
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

The Apify SDK requires <a href="https://nodejs.org/en/" target="_blank">Node.js</a> 7 or later.

### Local standalone usage

You can use Apify SDK in any Node.js project by running:

```bash
npm install apify
```

However, to make the package work at its full potential,
you'll need to set one or more of the following environment variables
for your Node.js process, depending on your circumstances:

<table class="table table-bordered table-condensed">
    <thead>
        <tr>
            <th>Environment variable</th>
            <th>Description</th>
        </tr>
    </thead>
    <tbody>
          <tr>
            <td><code>APIFY_LOCAL_EMULATION_DIR</code></td>
            <td>Defines the path to a local directory where key-value stores, request lists and request queues store their data.
            If omitted, the package will try to use cloud storage instead and will expect that the
            <code>APIFY_TOKEN</code> environment variable is defined.
            </td>
          </tr>
          <tr>
            <td><code>APIFY_TOKEN</code></td>
            <td>
            The API token for your Apify account. It is used to access Apify APIs, e.g. to access cloud storage.
            You can find your API token on the <a href="https://my.apify.com/account#intergrations" target="_blank">Apify - Account - Integrations</a> page.
            If omitted, you should define <code>APIFY_LOCAL_EMULATION_DIR</code> environment variable instead.
            </td>
          </tr>
          <tr>
            <td><code>APIFY_PROXY_PASSWORD</code></td>
            <td>Password to <a href="https://www.apify.com/docs/proxy" target="_blank">Apify Proxy</a> for IP address rotation.
            If you have have an Apify account, you can find the password on the
            <a href="https://my.apify.com/proxy" target="_blank">Proxy page</a> in the Apify app.</td>
          </tr>
          <tr>
            <td><code>APIFY_DEFAULT_KEY_VALUE_STORE_ID</code></td>
            <td>ID of the default key-value store, where the
            <code>Apify.getValue()</code> or <code>Apify.setValue()</code> functions store the values.
            If you defined <code>APIFY_LOCAL_EMULATION_DIR</code>, then each value is stored as a file at
            <code>[APIFY_LOCAL_EMULATION_DIR]/key-value-stores/[APIFY_DEFAULT_KEY_VALUE_STORE_ID]/[KEY].[EXT]</code>,
            where <code>[KEY]</code> is the key nad <code>[EXT]</code> corresponds to the MIME content type of the value.
            </td>
          </tr>
          <tr>
            <td><code>APIFY_DEFAULT_DATASET_ID</code></td>
            <td>ID of the default dataset, where the <code>Apify.pushData()</code> function store the data.
            If you defined <code>APIFY_LOCAL_EMULATION_DIR</code>, then dataset items are stored as files at
            <code>[APIFY_LOCAL_EMULATION_DIR]/datasets/[APIFY_DEFAULT_DATASET_ID]/[INDEX].json</code>,
            where <code>[INDEX]</code> is a zero-based index of the item.
            </td>
          </tr>
          <tr>
            <td><code> TODO APIFY_DEFAULT_REQUEST_QUEUE_ID</code></td>
            <td>ID of the default request queue, where the <code>Apify.to_do()</code> function stores the data.
            If you defined <code>APIFY_LOCAL_EMULATION_DIR</code>, then request queue records are stored as files at
            <code>[APIFY_LOCAL_EMULATION_DIR]/request-queues/[APIFY_DEFAULT_REQUEST_QUEUE_ID]/[INDEX].json</code>,
            where <code>[INDEX]</code> is a zero-based index of the item.
            </td>
          </tr>
    </tbody>
</table>


For the full list of environment variables used by Apify SDK, please see the
<a href="https://www.apify.com/docs/actor#environment-variabes" target="_blank">Environment variables</a>
section of the Apify actor documentation.


### Local usage with Apify command-line interface (CLI)

To avoid the need to set all the necessary environment variables manually,
to create a boilerplate of your project,
and to enable pushing and running your code on the Apify cloud,
you can take advantage of the
<a href="https://github.com/apifytech/apify-cli" target="_blank">Apify command-line interface</a> (CLI) tool.

The CLI can be installed by running:

```bash
npm -g install apify-cli
```

TODO: Use crawling example instead

Now you can create a boilerplate for you new web crawling project by running:

```bash
apify create my-hello-world
cd my-hello-world
```

Apify CLI prompts you to select a project template and then it creates a
directory called `my-hello-world` with the following files:

- `package.json` with the list of dependencies of the Node.js project
- `main.js` file containing source code for your project
- `apify_local` directory containing local emulation of <a href="https://www.apify.com/docs/storage" target="_blank">Apify storage types</a>
- files needed for optional deployment to Apify platform (`Dockerfile`, `apify.json`)
- `node_modules` directory containing all the required NPM packages
- `.gitignore`

If you chose template `Puppeteer` then the `main.js` file looks like:

```javascript
const Apify = require('apify');

Apify.main(async () => {
    const input = await Apify.getValue('INPUT');

    if (!input || !input.url) throw new Error('INPUT must contain a url!');

    console.log('Launching Puppeteer...');
    const browser = await Apify.launchPuppeteer();

    console.log(`Opening page ${input.url}...`);
    const page = await browser.newPage();
    await page.goto(input.url);
    const title = await page.title();
    console.log(`Title of the page "${input.url}" is "${title}".`);

    console.log('Closing Puppeteer...');
    await browser.close();

    console.log('Done.');
});
```

It simply takes a `url` field of its input opens that page using
<a href="https://github.com/GoogleChrome/puppeteer" target="_blank">Puppeteer</a> in Chrome browser and prints its title.
Input is always stored in default key-value store of run. Local emulation of this store you can find in directory
`apify_local/key-value-stores/default`. To create an input simply create a file `apify_local/key-value-stores/default/INPUT.json`
containing:

```javascript
{
  "url": "https://news.ycombinator.com"
}
```

Now can then run you code with:

```bash
apify run
```

and see following output:

```bash
Launching Puppeteer...

Opening page https://news.ycombinator.com...

Title of the page "https://news.ycombinator.com" is "Hacker News".

Closing Puppeteer...

Done.
```

Check <a href="#examples">examples</a> below to see what you can do with Apify SDK.
After you are done with your code
you can deploy your project to Apify platform with following 2 steps:

```bash
apify login
apify push
```

### Usage in actors on the Apify cloud platform

Check <a href="https://www.apify.com/docs/actor#quick-start" target="_blank">Apify actor</a> documentation to learn about actor
development on the Apify platform.

## Components

### BasicCrawler

Enables crawling of large number of web pages
in raw HTML or using <a href="https://www.npmjs.com/package/cheerio" target="_blank">cheerio</a>
HTML parser.
This is the most efficient web crawling method, but it does not work on websites that require JavaScript.


```js
const Apify = require('apify');
const requestPromise = require('request-promise');

...

// Prepare a list of URLs to crawl
const requestList = new Apify.RequestList({
  sources: [
      { url: 'http://www.example.com/page-1' },
      { url: 'http://www.example.com/page-2' },
  ],
});
await requestList.initialize();

// Crawl the URLs using a raw HTML downloader
const crawler = new Apify.BasicCrawler({
    requestList,
    handleRequestFunction: async ({ request }) => {
        // 'request' contains an instance of the Request class
        // Here we simply fetch the HTML of the page and store it to a dataset
        await Apify.pushData({
            url: request.url,
            html: await requestPromise(request.url),
        })
    },
});

await crawler.run();

```


<ul>
  <li>
     <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#BasicCrawler">BasicCrawler</a>
     - Enables crawling of large number of web pages
     in raw HTML or using <a href="https://www.npmjs.com/package/cheerio" target="_blank">cheerio</a>
     HTML parser.
     This is the most efficient web crawling method, but it does not work on websites that require JavaScript.
  </li>
  <li>
     <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#PuppeteerCrawler">PuppeteerCrawler</a>
     - Enables crawling of large number of web pages using headless Chrome browser
     and <a href="https://github.com/GoogleChrome/puppeteer">Puppeteer</a>.
     The pool of Chrome processes is automatically scaled up and down based on available system resources.
    </li>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestList">RequestList</a>
    - Represents a list of URLs to crawl. The URLs can be provided in code or in a text file.
    The list persists its state so that the crawling can resume
    when the Node.js process restarts.
  </li>
  <li>
     <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestQueue">RequestQueue</a>
     - Represents a queue of URLs to crawl, which is stored either on local filesystem or in cloud.
     The queue is used for deep crawling of websites, where you start with
     several URLs and then recursively follow links to other pages.
     The data structure supports both breath-first and depth-first crawling orders.
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
     <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#Dataset">KeyValueStore</a>
     - A simple key-value store for arbitrary data records or files, along with their MIME content type.
     It is ideal for saving screenshots of web pages, PDFs or any downloaded files.
     The data is stored on local filesystem or in the cloud.
  </li>
  <li>
     <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#AutoscaledPool" target="_blank">AutoscaledPool</a>
     - Runs asynchronous background tasks, while automatically adjusting the concurrency
     based on free system memory and CPU usage. This is useful for running headless Chrome tasks at scale.
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







## Puppeteer
<!-- Mirror this part to src/index.js -->

For those who are using <a href="https://github.com/GoogleChrome/puppeteer" target="_blank">Puppeteer</a> (headless/non-headless Chrome browser)
we have few helper classes and functions:

<ul>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#module-Apify-launchPuppeteer" target="_blank">launchPuppeteer()</a> function starts new instance of Puppeteer browser and returns its browser object.
  </li>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#PuppeteerPool" target="_blank">PuppeteerPool</a> helps to mantain a pool of Puppeteer instances. This is usefull
    when you need to restart browser after certain number of requests to rotate proxy servers.
  </li>
  <li>
      <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#PuppeteerCrawler" target="_blank">PuppeteerCrawler</a> helps to crawl a <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestList" target="_blank">RequestList</a> or <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestQueue" target="_blank">RequestQueue</a> in parallel using autoscaled pool.
  </li>
</ul>

```javascript
const url = 'https://news.ycombinator.com';

const browser = await Apify.launchPuppeteer();
const page = await browser.newPage();
await page.goto(url);
const title = await page.title();

console.log(`Title of the page "${url}" is "${title}".`);
```

For more information on Puppeteer see its <a href="https://github.com/GoogleChrome/puppeteer" target="_blank">documenation</a>.

</div>



## Components

### Storage

Apify package provides 3 storage types for commons use cases both locally and on Apify platform.

#### Key-value store

Key value store is simple storage that can be used for string or file (buffer) records.

```javascript
// Save value to key-value store.
await Apify.setValue('my-key', { foo: 'bar' });

// Get value from key-value store.
const value = await Apify.getValue('my-key');
```

For more information see complete <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#KeyValueStore" target="_blank">documentation</a>.

#### Dataset

The dataset is a storage that enables saving and retrieval of sequential data objects — typically results of some long running operation such as scraping or data extraction.
Dataset is immutable and allows only storing and retrieving of its items.

```javascript
// Push some data to dataset.
await Apify.pushData({ foo: 'bar' });
await Apify.pushData({ myArray: [1, 2, 3] });
```

For more information see complete <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#Dataset" target="_blank">documentation</a>.

#### Request queue

Request queue is used to manage a dynamic queue of web pages to crawl.

```javascript
const queue = await Apify.openRequestQueue('my-queue-id');

await queue.addRequest(new Apify.Request({ url: 'http://example.com/aaa'});
await queue.addRequest(new Apify.Request({ url: 'http://example.com/bbb'});

// Get requests from queue to be processed.
const request1 = queue.fetchNextRequest();
const request2 = queue.fetchNextRequest();

// Mark one of them as handled.
queue.markRequestHandled(request1);

// If processing fails then reclaim it back to the queue.
request2.pushErrorMessage('Request failed for network error!');
queue.reclaimRequest(request2);
```

For more information see complete <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestQueue" target="_blank">documentation</a>.

### Helper Classes

#### Autoscaled Pool

This class manages a pool of asynchronous resource-intensive tasks that are executed in parallel. The pool only starts new tasks if there is enough free memory and CPU capacity. The information about the CPU and memory usage is obtained either from the local system or from the Apify cloud infrastructure in case the process is running on the Apify actor platform.

```javascript
const pool = new Apify.AutoscaledPool({
    maxConcurrency: 50,
    runTaskFunction: () => {
        // Run some resource-intensive asynchronous operation here and return a promise...
    },
});

await pool.run();
```

For more information see complete <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#AutoscaledPool" target="_blank">documentation</a>.

#### Basic Crawler

Provides a simple framework for parallel crawling of web pages from a list of URLs managed by the RequestList class or dynamically enqueued URLs managed by RequestQueue.

For examples on how to use it see <a href="#examples">examples</a> section below and also check
<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#BasicCrawler" target="_blank">documentation</a>.

#### Puppeteer Crawler

Provides a simple framework for parallel crawling of web pages using the Chrome with Puppeteer. The URLs of pages to visit are given by Request objects that are provided by the RequestList class or a dynamically enqueued requests provided by the RequestQueue class.

For examples on how to use it see <a href="#examples">examples</a> section below and also check
<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#PuppeteerCrawler" target="_blank">documentation</a>.

#### Request List

Provides way to handle a list of URLs to be crawled. Each URL is represented using an instance of the `Request` class.

```javascript
const requestList = new Apify.RequestList({
    sources: [
        { url: 'http://www.example.com/page-1' },
        { url: 'http://www.example.com/page-2' },
    ],
});

// Get requests from list to be processed.
const request1 = requestList.fetchNextRequest();
const request2 = requestList.fetchNextRequest();

// Mark one of them as handled.
requestList.markRequestHandled(request1);

// If processing fails then reclaim it back to the queue.
request2.pushErrorMessage('Request failed for network error!');
requestList.reclaimRequest(request2);
```

For more information see complete <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestList" target="_blank">documentation</a>.

#### Puppeteer Pool

Provides a pool of Puppeteer (Chrome browser) instances. The class rotates the instances based on its configuration in order to change proxies.

```javascript
const puppeteerPool = new PuppeteerPool({ groups: 'some-proxy-group' });

// Open browser pages.
const page1 = await puppeteerPool.newPage();
const page2 = await puppeteerPool.newPage();
const page3 = await puppeteerPool.newPage();

// ... do something with pages ...

// Close all the browsers.
await puppeteerPool.destroy();
```

For more information see complete <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#PuppeteerPool" target="_blank">documentation</a>.

<div id="include-readme-3">


#### Puppeteer Live View

Enables real time inspection of individual Puppeteer browser instances by starting a web server @ `localhost:4321`. This is especially useful when using headless mode or a remote instance.
Puppeteer Live View provides the user with a dashboard listing all active browser instances and their active page details. The details show a page screenshot and raw HTML.

You can use Puppeteer Live View, either directly:
```javascriptThe function has no result,
const browser = Apify.launchPuppeteer({ liveView: true });
```
or while using PuppeteerCrawler:
```javascript
const crawler = new PuppeteerCrawler({
    launchPuppeteerOptions: { liveView: true },
    // other options
})
```

For debugging, you may want to add another option: `{ slowMo: 300 }` (see <a href="https://pptr.dev/#?product=Puppeteer&version=v1.6.0&show=api-puppeteerlaunchoptions" target="_blank">Puppeteer documentation</a>).

After you connect to `localhost:4321` (the port is configurable using `APIFY_CONTAINER_PORT` environment variable),
Puppeteer Live View will present you with the following screen:
<img src="https://www.apify.com/ext/sdk_assets/puppeteer-live-view-dashboard.png">

Click on the magnifying glass icon will take you to a page detail, showing its screenshot and raw HTML:
<img src="https://www.apify.com/ext/sdk_assets/puppeteer-live-view-detail.png">

For more information see complete <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#PuppeteerLiveViewServer" target="_blank">documentation</a>.


## Promises vs. callbacks

All asynchronous functions provided by the <code>apify</code> package return
a <a href="http://bluebirdjs.com/" target="_blank" rel="noopener">bluebird</a> Promise.
If you prefer to use callbacks, you can use
the <a href="http://bluebirdjs.com/docs/api/ascallback.html" target="_blank" rel="noopener">.asCallback()</a> function.
For example:

```js
const Apify = require('apify');

Apify.launchPuppeteer().asCallback((err, browser) => {
  // Write you callback code here...
});
```


## Examples

Directory <a href="https://github.com/apifytech/apify-js/tree/master/examples" target="_blank">examples</a> of this repository demonstrates different usages of this package.

### Recursive crawling

Following 2 examples demonstrate recursive crawling of <a href="https://news.ycombinator.com" target="_blank">https://news.ycombinator.com</a>.
Crawler starts at https://news.ycombinator.com and in each step enqueues a new page linked by "more" button at the bottom of the page
and stores posts from the opened page in a <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#Dataset" target="_blank">Dataset</a>. As a queue crawler uses <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestQueue" target="_blank">Request Queue</a>.

Former example crawls page simply using NPM <a href="https://www.npmjs.com/package/request" target="_blank">Request</a> and
<a href="https://www.npmjs.com/package/cheerio" target="_blank">Cheerio</a> packages and former one uses
<a href="https://github.com/GoogleChrome/puppeteer" target="_blank">Puppeteer</a> that provides full Chrome browser.

- <a href="https://github.com/apifytech/apify-js/tree/master/examples/crawler_puppeteer.js">Recursive crawl with Puppeteer</a>
- <a href="https://github.com/apifytech/apify-js/tree/master/examples/crawler_cheerio.js">Recursive crawl with Cheerio and Request NPM packages</a>

### Crawling url list

These examples show how to scrape data from a fix list of urls using
<a href="https://github.com/GoogleChrome/puppeteer" target="_blank">Puppeteer</a> or
<a href="https://www.npmjs.com/package/request" target="_blank">Request</a> and
<a href="https://www.npmjs.com/package/cheerio" target="_blank">Cheerio</a>.

- <a href="https://github.com/apifytech/apify-js/tree/master/examples/url_list_puppeteer.js">Crawling a url list with Puppeteer</a>
- <a href="https://github.com/apifytech/apify-js/tree/master/examples/url_list_cheerio.js">Crawling a url list with Cheerio and Request NPM packages</a>

### Call to another actor

This example shows how to call another actor on the Apify platform - in this case `apify/send-mail`
to send email.

<a href="https://github.com/apifytech/apify-js/tree/master/examples/call_another_act.js">Check source code here</a>

### Actor used and synchronous API

This example shows an actor that has short runtime - just few seconds. It opens a webpage
http://goldengatebridge75.org/news/webcam.html that contains webcam stream from Golden Gate
bridge, takes a screenshot and saves it as output. This makes the actor executable on Apify platform
synchronously with a single request that also returns its output.

Example is shared in library under https://www.apify.com/apify/example-golden-gate-webcam
so you can easily run it with request to
`https://api.apify.com/v2/acts/apify~example-golden-gate-webcam/run-sync?token=[YOUR_API_TOKEN]`
and get image as response. Then you can for example use it directly in html:

```html
<img src="https://api.apify.com/v2/acts/apify~example-golden-gate-webcam/run-sync?token=[YOUR_API_TOKEN]" />
```

<a href="https://github.com/apifytech/apify-js/tree/master/examples/url_list_cheerio.js">Check source code here</a>

### Other

- <a href="https://github.com/apifytech/apify-js/tree/master/examples/autoscaled_pool.js">Use of AutoscaledPool</a>

</div>
