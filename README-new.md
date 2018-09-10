# Apify SDK: The web scraping and automation library for Node.js
<!-- Mirror this part to src/index.js -->

[![npm version](https://badge.fury.io/js/apify.svg)](http://badge.fury.io/js/apify)
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
  View the full <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest/" target="_blank">Apify SDK Programmer's Reference</a> on a separate website.
</div>


<!--
## Table of Content
-->

<!-- toc -->
<!--
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
  * [Actor used and synchronous API](#act-used-and-synchronous-api)
  * [Other](#other)
-->

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
     - Provides a simple framework for parallel crawling of web pages,
     whose URLs are fed either from a static list or from a dynamic queue of URLs.
     This class serves as a base for more complex crawlers (see below).
  </li>
  <li>
     <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#CheerioCrawler">CheerioCrawler</a>
     - Enables parallel crawling of large number of web pages
     using <a href="https://www.npmjs.com/package/cheerio" target="_blank">cheerio</a>
     HTML parser.
     This is the most efficient web crawling method, but it does not work on websites that require JavaScript.
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

The Apify SDK requires <a href="https://nodejs.org/en/" target="_blank">Node.js</a> 8 or later.

### Local standalone usage

You can add Apify SDK to any Node.js project by running:

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
            <td><code>APIFY_DEFAULT_REQUEST_QUEUE_ID</code></td>
            <td>ID of the default request queue, where functions like <code>RequestQueue.addRequest()</code> store the data.
            If you defined <code>APIFY_LOCAL_EMULATION_DIR</code>, then request queue records are stored as files at
            <code>[APIFY_LOCAL_EMULATION_DIR]/request-queues/[APIFY_DEFAULT_REQUEST_QUEUE_ID]/[NUM].json</code>,
            where <code>[NUM]</code> indicates the order of the item in the queue.
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

Now you can create a boilerplate of you new web crawling project by running:

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

Note that the CLI automatically sets all necessary environment variables.
The `APIFY_LOCAL_EMULATION_DIR` variable is set to `./apify_local` directory,
where all the data will be stored.
For example, the input JSON file for the actor is expected to be in the default key-value store
in `./apify_local/key-value-stores/default/INPUT.json`.

With the CLI you can also easily deploy your code to Apify cloud by running:

```bash
apify login
apify push
```

Your actor will be uploaded to Apify cloud and built there.

For more information, view the [Apify CLI documentation](https://www.apify.com/docs/cli).


### Usage in actors on the Apify cloud platform

You can also develop your web scraping project
directly in IDE on Apify platform. Go to [Actors](https://my.apify.com/actors)
page in the app, click <b>Create new</b> and then go to
<b>Source</b> tab and start writing your code. It's that simple.

For more information, view the [Apify actors quick start guide](https://www.apify.com/docs/actor#quick-start).


## Examples

TODO: This sections need to be finished

All the following examples can be found in the [./examples] directory in the repository.

### Load few pages in raw HTML

TODO: maybe use example from https://www.apify.com/docs/sdk/apify-runtime-js/latest#BasicCrawler, but make sure it's working

### Crawl a large list of URLs with Cheerio

Demonstrates how to create a crawler that will take
a list of URLs from a CSV file and crawls the pages using
<a href="https://www.npmjs.com/package/cheerio" target="_blank">cheerio</a>
HTML parser. The results are stored into a dataset.

TODO

### Recursively crawl a website using headless Chrome / Puppeteer

Demonstrates how to recursively TODO


### Save page screenshots into key-value store

TODO

### Run Puppeteer with Apify Proxy

TODO


### Invoke another actor

This example demonstrates how to call another actor on Apify cloud - in this case `apify/send-mail`
to send an email.

TODO




## Puppeteer live view

Apify SDK enables real-time view of launched Puppeteer browser instances and their open tabs,
including screenshots of the pages and snapshots of HTML.
This is useful for debugging your crawlers that run in headless mode.

The live view dashboard is run on a web server that is started on a port specified
by the `APIFY_CONTAINER_PORT` environment variable (typically 4321).
To enable the live view, pass the `liveView: true` option to `Apify.launchPuppeteer()`:

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

If you find any problem with Apify SDK, please [submit an issue on GitHub](https://github.com/apifytech/apify-js/issues).

## Contributing

Your code contributions are welcome and you'll praised to the eternity!
If you have any ideas for improvements, either submit an issue or create a pull request.
