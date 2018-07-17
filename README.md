# Apify: web scraping and automation SDK for JavaScript / Node.js
<!-- Mirror this part to src/index.js -->

[![npm version](https://badge.fury.io/js/apify.svg)](http://badge.fury.io/js/apify)
[![Build Status](https://travis-ci.org/apifytech/apify-js.svg)](https://travis-ci.org/apifytech/apify-js)

<div id="include-readme-1">
  The <code>apify</code> NPM package enables the development of web scrapers, crawlers and web automation projects
  either locally or running on <a href="https://www.apify.com/docs/actor" target="_blank">Apify actor</a> -
  a serverless computing platform that enables the execution of arbitrary code in the cloud.

  The package provides helper functions to launch web browsers with proxies, access storage, etc. Note that usage of the package is optional - you can create actors on the Apify platform without it.

  For more information about Apify actors, please see https://www.apify.com/docs/actor
</div>

Complete documentation of this package is available at https://www.apify.com/docs/sdk/apify-runtime-js/latest

## Table of Contents

<!-- toc -->

- [Common use-cases](#common-use-cases)
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

## Common use-cases
<!-- Mirror this part to src/index.js -->

The main goal of this package is to help with implementation of web scraping and automation projects. Some of the
most common use-cases are:

<ul>
  <li>
    If you want to <strong>crawl</strong> a website using for example <a href="https://www.npmjs.com/package/request" target="_blank">
    Request</a> package then take a look at <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#BasicCrawler" target="_blank">BasicCrawler</a>
    in combination with <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestList" target="_blank">RequestList</a> for fix list of urls
    or <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestQueue" target="_blank">RequestQueue</a> for recursive crawl.
  </li>
  <li>
    If you want to crawl a website using a real <strong>browser</strong>. Then use
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#PuppeteerCrawler" target="_blank">PuppeteerCrawler</a> which uses
    <a href="https://github.com/GoogleChrome/puppeteer" target="_blank">Puppeteer</a> (headless/non-headless Chrome browser). PuppeteerCrawler supports
    both <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestList" target="_blank">RequestList</a> for fix list of urls
    or <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestQueue" target="_blank">RequestQueue</a> for recursive crawl.
  </li>
  <li>
    If you need to process a high volume of <strong>asynchronous tasks in parallel</strong>, then take a
    look at <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#AutoscaledPool" target="_blank">AutoscaledPool</a>. This class executes defined tasks in a pool which size is scaled based on available memory and CPU.
  </li>
  <li>
    If you want to automate the filling of forms or any other web interaction, then you can use
    <a href="https://github.com/GoogleChrome/puppeteer" target="_blank">Puppeteer</a> (headless/non-headless Chrome browser).
  </li>
</ul>

If you deploy your code to Apify platform then you can set up scheduler or execute your code with web API.

## Quick start

To use Apify SDK you must have <a href="https://nodejs.org/en/" target="_blank">Node JS</a> (version 7.0.0 or newer) and
<a href="https://www.npmjs.com" target="_blank">NPM</a> installed. If you have both then the easiest way how to start is to use
<a href="https://github.com/apifytech/apify-cli" target="_blank">Apify CLI</a> (command line tool).

Install the tool with:

```bash
npm -g install apify-cli
```

and create your project with:

```bash
apify create my_hello_world

cd my_hello_world
```

Apify CLI asks to you choose a template and then creates a directory `my_hello_world` containing:

- `package.json` with Apify SDK as dependency
- `main.js` containing basic code for your project
- `apify_local` directory containing local emultation of <a href="https://www.apify.com/docs/storage" target="_blank">Apify storage types</a>
- files needed for optional deployment to Apify platform (`Dockerfile`, `apify.json`)
- `node_modules` directory containing all the required NPM packages

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

Check <a href="#examples">examples</a> below to see what you can do with Apify SDK. After you are done with your code
you can deploy your project to Apify platform with following 2 steps:

```bash
apify login
apify push
```

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

Provides way to handle a list of URLs to be crawled. Each URL is reprented using an instance of the Request class.

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

## Local usage

The easiest way how to use apify locally is with <a href="https://github.com/apifytech/apify-cli" target="_blank">Apify CLI</a> as shown
in <a href="#quick-start">quick start</a> section. Other way is to manually define required environment variables:

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
             <td>
                 Directory where apify package locally emulates Apify storages - key-value store and dataset.
                 Key-value stores will be emulated in directory
                 <code>[APIFY_LOCAL_EMULATION_DIR]/key-value-stores/[STORE_ID]</code>
                 and datasets in directory
                 <code>[APIFY_LOCAL_EMULATION_DIR]/datasets/[DATESET_ID]</code>.
             </td>
         </tr>
         <tr>
             <td><code>APIFY_DEFAULT_KEY_VALUE_STORE_ID</code></td>
             <td>ID of default key-value store.</td>
         </tr>
         <tr>
             <td><code>APIFY_DEFAULT_DATASET_ID</code></td>
             <td>ID of default dataset.</td>
         </tr>
         <tr>
             <td><code>APIFY_DEFAULT_REQUEST_QUEUE_ID</code></td>
             <td>ID of default request queue.</td>
         </tr>
     </tbody>
</table>

Apify will then store key-value store records in files named <code>[KEY].[EXT]</code> where <code>[KEY]</code>
is the record key and <code>[EXT]</code> is based on the record content type. Dataset items will be stored
in files named <code>[ID].json</code> where <code>[ID]</code> is sequence number of your dataset item.
 *
If you want to use <a href="https://www.apify.com/docs/proxy" target="_blank">Apify Proxy</a> locally
then you must define an environment variable <code>PROXY_PASSWORD</code> with password you find at
<a href="https://my.apify.com/proxy" target="_blank">https://my.apify.com/proxy</a>.

## Promises vs. callbacks

By default, all asynchronous functions provided by this package return a promise.
But Apify uses a <a href="http://bluebirdjs.com/" target="_blank">Bluebird</a>
promise implementation so you can easily convert any function that returns a Promise
into callback style function.
See <a href="http://bluebirdjs.com/docs/api/promise.promisify.html" target="_blank">Bluebird documentation</a>
for more information.

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
