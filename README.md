# Apify: web scraping and automation SDK for JavaScript / Node.js
<!-- Mirror this part to src/index.js -->

[![npm version](https://badge.fury.io/js/apify.svg)](http://badge.fury.io/js/apify)
[![Build Status](https://travis-ci.org/apifytech/apify-js.svg)](https://travis-ci.org/apifytech/apify-js)


The `apify` NPM package enables development of web scrapers, crawlers and web automation projects
either locally or running on <a href="https://www.apify.com/docs/actor" target="_blank">Apify Actor</a> -
a serverless computing platform that enables execution of arbitrary code in the cloud.
The package provides helper functions to launch web browsers with proxies, access the storage etc. Note that the usage of the package is optional, you can create acts at Apify platform without it.

Complete documentation of this package is available at https://www.apify.com/docs/sdk/apify-runtime-js/latest

For more information about the Apify Actor platform, please see https://www.apify.com/docs/actor

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
- [Examples](#examples)
  * [Recursive crawling](#recursive-crawling)
  * [Crawling url list](#crawling-url-list)
  * [Other](#other)

<!-- tocstop -->

## Common use-cases
<!-- Mirror this part to src/index.js -->

Main goal of this package is to help with implementation of web scraping and automation projects. Some of the
most common use-cases are:

<ul>
  <li>
    If you need to process high volume of <strong>asynchronous tasks in parallel</strong> then take a
    look at <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#AutoscaledPool">AutoscaledPool</a>. This class executes defined tasks in a pool which size is scaled based on available memory and CPU.
  </li>
  <li>
    If you want to <strong>crawl</strong> a website using for example <a href="https://www.npmjs.com/package/request" target="_blank">
    Request</a> package then take a look at <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#BasicCrawler" target="_blank">BasicCrawler</a>
    in combination with <a href="#request-list">RequestList</a> for fix list of urls
    or <a href="#request-queue">RequestQueue</a> for recursive crawl.
  </li>
  <li>
    If you want to crawl a website using a real <strong>browser</strong>. Then use
    <a href="#puppeteer-crawler">PuppeteerCrawler</a> which uses
    <a href="https://github.com/GoogleChrome/puppeteer" target="_blank">Puppeteer</a> (headless Chrome browser). PuppeteerCrawler supports
    both <a href="#request-list">RequestList</a> for fix list of urls
    or <a href="#request-queue">RequestQueue</a> for recursive crawl.
  </li>
</ul>

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
- `apify_local` directory containing local emultation of <a href="#storage">Apify storage types</a>
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

```
Launching Puppeteer...

Opening page https://news.ycombinator.com...

Title of the page "https://news.ycombinator.com" is "Hacker News".

Closing Puppeteer...

Done.
```


Check <a href="#examples">examples</a> below to see what you can do with Apify SDK. After you are done with your code
you can deploy your project to Apify platform with following 2 steps:

```
apify login
apify push
```



## Puppeteer
<!-- Mirror this part to src/index.js -->

For those who are using <a href="https://github.com/GoogleChrome/puppeteer" target="_blank">Puppeteer</a> (headless Chrome browser)
we have few helper classes and functions:

<ul>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#module-Apify-launchPuppeteer" target="_blank">launchPuppeteer()</a> function starts new instance of Puppeteer browser and returns its browser object.
  </li>
  <li>
    <a href="#puppeteer-pool">PuppeteerPool</a> helps to mantain a pool of Puppeteer instances. This is usefull
    when you need to restart browser after certain number of requests to rotate proxy servers.
  </li>
  <li>
      <a href="#puppeteer-crawler">PuppeteerCrawler</a> helps to crawl a <a href="#request-list">RequestList</a> or <a href="#request-queue">RequestQueue</a> in parallel using autoscaled pool.
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

## Components

### Storage

Apify package provides 3 storage types for commons use cases both locally and at Apify platform.

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

This class manages a pool of asynchronous resource-intensive tasks that are executed in parallel. The pool only starts new tasks if there is enough free memory and CPU capacity. The information about the CPU and memory usage is obtained either from the local system or from the Apify cloud infrastructure in case the process is running on the Apify Actor platform.

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

Provides a simple framework for parallel crawling of web pages using the headless Chrome with Puppeteer. The URLs of pages to visit are given by Request objects that are provided by the RequestList class or a dynamically enqueued requests provided by the RequestQueue class.

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

## Examples

Directory <a href="https://github.com/apifytech/apify-js/tree/master/src">examples</a> of this repository demonstrates different usages of this package.

### Recursive crawling

Following 2 examples demonstrate recursive crawling of <a href="https://news.ycombinator.com">https://news.ycombinator.com</a>.
Crawler starts at https://news.ycombinator.com and in each step enqueues a new page linked by "more" button at the bottom of the page
and stores posts from the opened page in a <a href="#dataset">Dataset</a>. As a queue crawler uses <a href="#request-queue">Request Queue</a>.

Former example crawls page simply using NPM <a href="https://www.npmjs.com/package/request" target="_blank">request</a> and
<a href="https://www.npmjs.com/package/cheerio" target="_blank">cheerio</a> packages and former one uses
<a href="https://github.com/GoogleChrome/puppeteer" target="_blank">Puppeteer</a> that provides full Chrome browser.

- Crawling with request and cheerio
- <a href="./examples/crawler_puppeteer.js">Crawling with Puppeteer</a>

### Crawling url list

- Crawling url list with request and cheerio
- Crawling url list with Puppeteer

### Other

- Calling another act
- State persistence
- Filling form and sending data by email