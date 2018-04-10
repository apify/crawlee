# apify: Apify: web scraping and automation SDK for JavaScript / Node.js
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
- [Puppeteer](#puppeteer)
- [Components](#components)
  * [Storages](#storages)
    + [Key-value store [doc]](#key-value-store-doc)
    + [Dataset [doc]](#dataset-doc)
    + [Request queue [doc]](#request-queue-doc)
  * [Helper Classes](#helper-classes)
    + [Autoscaled Pool [doc]](#autoscaled-pool-doc)
    + [Basic Crawler [doc]](#basic-crawler-doc)
    + [Puppeteer Crawler [doc]](#puppeteer-crawler-doc)
    + [Request List [doc]](#request-list-doc)
    + [Puppeteer Pool [doc]](#puppeteer-pool-doc)
- [Examples](#examples)

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
    in combination with <a href="#request-list-doc">RequestList</a> for fix list of urls
    or <a href="#request-queue-doc">RequestQueue</a> for recursive crawl.
  </li>
  <li>
    If you want to crawl a website using a real <strong>browser</strong>. Then use
    <a href="#puppeteer-crawler-doc">PuppeteerCrawler</a> which uses
    <a href="https://github.com/GoogleChrome/puppeteer" target="_blank">Puppeteer</a> (headless Chrome browser). PuppeteerCrawler supports
    both <a href="#request-list-doc">RequestList</a> for fix list of urls
    or <a href="#request-queue-doc">RequestQueue</a> for recursive crawl.
  </li>
</ul>

## Puppeteer
<!-- Mirror this part to src/index.js -->

For those who are using <a href="https://github.com/GoogleChrome/puppeteer" target="_blank">Puppeteer</a> (headless Chrome browser)
we have few helper classes and functions:

<ul>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#module-Apify-launchPuppeteer" target="_blank">Apify.launchPuppeteer()</a> function starts new instance of Puppeteer browser and returns its browser object.
  </li>
  <li>
    <a href="#puppeteer-pool-doc">PuppeteerPool</a> helps to mantain a pool of Puppeteer instances. This is usefull
    when you need to restart browser after certain number of requests to rotate proxy servers.
  </li>
  <li>
      <a href="#puppeteer-crawler-doc">PuppeteerCrawler</a> helps to crawl a <a href="#request-list-doc">RequestList</a> or <a href="#request-queue-doc">RequestQueue</a> in parallel using autoscaled pool.
  </li>
</ul>

## Components

### Storages

Apify package provides 3 storage types for commons use cases both locally and at Apify platform.

#### Key-value store [<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#KeyValueStore" target="_blank">doc</a>]

Key value store is simple storage that can be used for string or file (buffer) records.

```javascript
// Save value to key-value store.
await Apify.setValue('my-key', { foo: 'bar' });

// Get value from key-value store.
const value = await Apify.getValue('my-key');
```

#### Dataset [<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#Dataset" target="_blank">doc</a>]

The dataset is a storage that enables saving and retrieval of sequential data objects — typically results of some long running operation such as scraping or data extraction.
Dataset is immutable and allows only storing and retrieving of its items.

```javascript
// Push some data to dataset.
await Apify.pushData({ foo: 'bar' });
await Apify.pushData({ myArray: [1, 2, 3] });
```

#### Request queue [<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestQueue" target="_blank">doc</a>]

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

### Helper Classes

#### Autoscaled Pool [<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#AutoscaledPool" target="_blank">doc</a>]

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

#### Basic Crawler [<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#BasicCrawler" target="_blank">doc</a>]

Provides a simple framework for parallel crawling of web pages from a list of URLs managed by the RequestList class or dynamically enqueued URLs managed by RequestQueue.

For examples on how to use it see <a href="#examples">examples</a> section below.

#### Puppeteer Crawler [<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#PuppeteerCrawler" target="_blank">doc</a>]

Provides a simple framework for parallel crawling of web pages using the headless Chrome with Puppeteer. The URLs of pages to visit are given by Request objects that are provided by the RequestList class or a dynamically enqueued requests provided by the RequestQueue class.

For examples on how to use it see <a href="#examples">examples</a> section below.

#### Request List [<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestList" target="_blank">doc</a>]

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

#### Puppeteer Pool [<a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#PuppeteerPool" target="_blank">doc</a>]

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

## Examples

Directory `/examples` of this repo contains examples of different usages of this package.