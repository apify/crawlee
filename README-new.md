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

It works right off the bat locally. No configuration needed.
To make the package work with Apify cloud services
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
            <td><code>APIFY_TOKEN</code></td>
            <td>
            The API token for your Apify account. It is used to access Apify APIs, e.g. to access cloud storage.
            You can find your API token on the <a href="https://my.apify.com/account#intergrations" target="_blank">Apify - Account - Integrations</a> page.
            </td>
          </tr>
          <tr>
            <td><code>APIFY_PROXY_PASSWORD</code></td>
            <td>Password to <a href="https://www.apify.com/docs/proxy" target="_blank">Apify Proxy</a> for IP address rotation.
            If you have have an Apify account, you can find the password on the
            <a href="https://my.apify.com/proxy" target="_blank">Proxy page</a> in the Apify app.
            You may freely use your own proxies, instead of the Apify pool.
            </td>
          </tr>
    </tbody>
</table>


For the full list of environment variables used by Apify SDK, please see the
<a href="https://www.apify.com/docs/actor#environment-variabes" target="_blank">Environment variables</a>
section of the Apify actor documentation.


### Local usage with Apify command-line interface (CLI)

To avoid the need to set the necessary environment variables manually,
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

The default local storage folder is set to `./apify_local` directory, where all the data will be stored.
For example, the input JSON file for the actor is expected to be in the default key-value store
in `./apify_local/key_value_stores/default/INPUT.json`.

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

Because examples are often the best way to explain anything, let's look at some of the above
described features put to good use in solving various scraping challenges.

All the following examples can be found in the [./examples](https://github.com/apifytech/apify-js/tree/master/examples) directory in the repository.

To run the examples, just copy them into the folder where you installed Apify by using
`npm install apify` and then run them by calling e.g.:
```
node 1_basic_crawler.js
```

Or, using the Apify CLI, you can copy the source code of one of the examples into the `main.js`
file, created by Apify CLI and then simply call
```
apify run
```
in the project's folder.

### 1 - Load a few pages in raw HTML
This is the most basic example of using the Apify SDK. Start with it. It explains some
essential concepts that are used throughout the SDK.
```javascript
// We require the Apify SDK and a popular client to make HTTP requests.
const Apify = require('apify');
const requestPromise = require('request-promise');

// The Apify.main() function wraps the crawler logic and is a mandatory
// part of every crawler run using Apify SDK.
Apify.main(async () => {
    // Prepare a list of URLs to crawl. For that we use an instance of the RequestList class.
    // Here we just throw some URLs into an array of sources, but the RequestList can do much more.
    const requestList = new Apify.RequestList({
        sources: [
            { url: 'http://www.google.com/' },
            { url: 'http://www.example.com/' },
            { url: 'http://www.bing.com/' },
            { url: 'http://www.wikipedia.com/' },
        ],
    });

    // Since initialization of the RequestList is asynchronous, you must always
    // call .initialize() before using it.
    await requestList.initialize();

    // To crawl the URLs, we use an instance of the BasicCrawler class which is our simplest,
    // but still powerful crawler. Its constructor takes an options object where you can
    // configure it to your liking. Here, we're keeping things simple.
    const crawler = new Apify.BasicCrawler({

        // We use the request list created earlier to feed URLs to the crawler.
        requestList,

        // We define a handleRequestFunction that describes the actions
        // we wish to perform for each URL.
        handleRequestFunction: async ({ request }) => {
            // 'request' contains an instance of the Request class which is a container
            // for request related data such as URL or Method (GET, POST ...) and is supplied by the requestList we defined.
            console.log(`Processing ${request.url}...`);

            // Here we simply fetch the HTML of the page and store it to the default Dataset.
            await Apify.pushData({
                url: request.url,
                html: await requestPromise(request.url),
            });
        },
    });

    // Once started the crawler, will automatically work through all the pages in the requestList
    // and the created promise will resolve once the crawl is completed. The collected HTML will be
    // saved in the ./apify_storage/datasets/default folder, unless configured differently.
    await crawler.run();
    console.log('Crawler finished.');
});
```

### 2 - Crawl a large list of URLs with Cheerio
This example shows how to extract data (the content of title and all h1 tags) from an external
list of URLs (parsed from a CSV file) using CheerioCrawler.

It builds upon the previous BasicCrawler example, so if you missed that one, you should check it out.
```javascript
const Apify = require('apify');

// Utils is a namespace with nice to have things, such as logging control.
const { log } = Apify.utils;
// This is how you can turn internal logging off.
log.setLevel(log.LEVELS.OFF);

// This is just a list of Fortune 500 companies' websites available on GitHub.
const CSV_LINK = 'https://gist.githubusercontent.com/hrbrmstr/ae574201af3de035c684/raw/2d21bb4132b77b38f2992dfaab99649397f238e9/f1000.csv';

Apify.main(async () => {
    // Using the 'requestsFromUrl' parameter instead of 'url' tells the RequestList to download
    // the document available at the given URL and parse URLs out of it.
    const requestList = new Apify.RequestList({
        sources: [{ requestsFromUrl: CSV_LINK }],
    });
    await requestList.initialize();

    // We're using the CheerioCrawler here. Its core difference from the BasicCrawler is the fact
    // that the HTTP request is already handled for you and you get a parsed HTML of the
    // page in the form of the cheerio object - $.
    const crawler = new Apify.CheerioCrawler({
        requestList,

        // We define some boundaries for concurrency. It will be automatically managed.
        // Here we say that no less than 5 and no more than 50 parallel requests should
        // be run. The actual concurrency amount is based on memory and CPU load and is
        // managed by the AutoscaledPool class.
        minConcurrency: 10,
        maxConcurrency: 50,

        // We can also set the amount of retries.
        maxRequestRetries: 1,

        // Or the timeout for each page in seconds.
        handlePageTimeoutSecs: 3,

        // In addition to the BasicCrawler, which only provides access to the request parameter,
        // CheerioCrawler further exposes the '$' parameter, which is the cheerio object containing
        // the parsed page, and the 'html' parameter, which is just the raw HTML.
        // Also, since we're not making the request ourselves, the function is named differently.
        handlePageFunction: async ({ $, html, request }) => {
            console.log(`Processing ${request.url}...`);

            // Extract data with cheerio.
            const title = $('title').text();
            const h1texts = [];
            $('h1').each((index, el) => {
                h1texts.push({
                    text: $(el).text(),
                });
            });

            // Save data to default Dataset.
            await Apify.pushData({
                url: request.url,
                title,
                h1texts,
                html,
            });
        },

        // If request failed 1 + maxRequestRetries then this function is executed.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed twice.`);
        },
    });

    await crawler.run();
    console.log('Crawler finished.');
});
```

### 3 - Recursively crawl a website using headless Chrome / Puppeteer
This example demonstrates how to use PuppeteerCrawler in connection with the RequestQueue to recursively scrape
the Hacker News site (https://news.ycombinator.com). It starts with a single URL where it finds more links,
enqueues them to the RequestQueue and continues until no more desired links are available.
```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Apify.openRequestQueue() is a factory to get preconfigured RequestQueue instance.
    const requestQueue = await Apify.openRequestQueue();

    // Enqueue only the first URL.
    await requestQueue.addRequest(new Apify.Request({ url: 'https://news.ycombinator.com/' }));

    // Create a PuppeteerCrawler. It's configuration is similar to the CheerioCrawler,
    // only instead of the parsed HTML, handlePageFunction gets an instance of the
    // Puppeteer.Page class. See Puppeteer docs for more information.
    const crawler = new Apify.PuppeteerCrawler({
        // Use of requestQueue is similar to RequestList.
        requestQueue,

        // Run Puppeteer headless. If you turn this off, you'll see the scraping
        // browsers showing up on screen. Non-headless mode is great for debugging.
        launchPuppeteerOptions: { headless: true },

        // For each Request in the queue, a new Page is opened in a browser.
        // This is the place to write the Puppeteer scripts you are familiar with,
        // with the exception that browsers and pages are managed for you by Apify SDK automatically.
        handlePageFunction: async ({ page, request }) => {
            console.log(`Processing ${request.url}...`);

            // A function to be evaluated by Puppeteer within
            // the browser context.
            const pageFunction = ($posts) => {
                const data = [];

                // We're getting the title, rank and url of each post on Hacker News.
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

            // Save data to default Dataset.
            await Apify.pushData(data);

            // To continue crawling, we need to enqueue some more pages into
            // the requestQueue. First we find the correct URLs using Puppeteer
            // and then we add the request to the queue.
            try {
                const nextHref = await page.$eval('.morelink', el => el.href);
                // You may omit the Request constructor and just use a plain object.
                await requestQueue.addRequest(new Apify.Request({ url: nextHref }));
            } catch (err) {
                console.log(`Url ${request.url} is the last page!`);
            }
        },

        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed 4 times`); // Because 3 retries is the default value.
        },
    });

    // Run crawler.
    await crawler.run();
    console.log('Crawler finished.');
});
```

### 4 - Save page screenshots into KeyValueStore
This example shows how to work with KeyValueStore. It crawls a list of URLs using Puppeteer,
capture a screenshot of each page and saves it to the KeyValueStore. The list of URLs is
provided as INPUT, which is a standard way of passing initial configuration to Apify actors.
Locally, INPUT needs to be placed in the KeyValueStore. On the platform, it can either be set
using the applications UI or passed as the body of the Run Actor API call.

For more information on RequestList, see example 1. For PuppeteerCrawler, see example 3.
```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Apify.getValue() is a shorthand to read the value of the provided key (INPUT) from the default KeyValueStore.
    // To read the INPUT on your local machine, you first need to create it.
    // Place an INPUT.json file with the desired input into the
    // ./apify_storage/key_value_stores/default directory (unless configured otherwise).
    // Example input: { "sources": [{ "url": "https://www.google.com" },  { "url": "https://www.duckduckgo.com" }] }
    const { sources } = await Apify.getValue('INPUT');

    const requestList = new Apify.RequestList({ sources });
    await requestList.initialize();

    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        launchPuppeteerOptions: { headless: true },
        handlePageFunction: async ({ page, request }) => {
            console.log(`Processing ${request.url}...`);

            // This is a Puppeteer function that takes a screenshot of the Page and returns its buffer.
            const screenshotBuffer = await page.screenshot();

            // uniqueKey is a normalized URL of the request,
            // but KeyValueStore keys may only include [a-zA-Z0-9!-_.'()] characters.
            const key = request.uniqueKey.replace(/[:/]/g, '_');

            // Here we save the screenshot. Choosing the right content type will automatically
            // assign the local file the right extension. In this case: .png
            await Apify.setValue(key, screenshotBuffer, { contentType: 'image/png' });
            console.log('Screenshot saved.');
        },
    });

    // Run crawler.
    await crawler.run();
    console.log('Crawler finished.');
});
```

### 5 - Run Puppeteer with Apify Proxy
This example demonstrates the use of Apify features with Puppeteer.
We'll show you how to use Apify Proxy without using our Crawlers
and instead using only Puppeteer itself.
```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Apify enhances not only our Crawlers, but also plain Puppeteer
    // with useful tools such as automatic proxy use (from our own pool).
    // To use the Proxy, you need to either log in using the Apify CLI, or set
    // the APIFY_PROXY_PASSWORD environment variable. You will find the password
    // under your account in the Apify Platform.
    // Other options such as LiveView may also be enabled for Puppeteer.
    const options = {
        useApifyProxy: true,
        headless: true,
    };

    // Apify.launchPuppeteer() is a shortcut to get a preconfigured Puppeteer.Browser
    // instance with extra features provided by Apify. All original Puppeteer options
    // are passed directly to Puppeteer.
    const browser = await Apify.launchPuppeteer(options);

    console.log('Running Puppeteer...');
    // Proceed with a plain Puppeteer script.
    const page = await browser.newPage();
    const url = 'https://en.wikipedia.org/wiki/Main_Page';
    await page.goto(url);
    const html = await page.content();

    // Use any Apify feature.
    await Apify.pushData({ url, html });

    // Cleaning up resources is a good practice.
    await browser.close();
    console.log('Puppeteer closed.');
});
```


### 6 - Invoke another actor
This example shows how to call another actor - in this case apify/send-mail to send
an email.

For this demonstration, we've chosen to scrape BTC prices. If you don't want to miss the chance of
of your life then you can use this code to get current BTC prices from Kraken.com
and mail them to your mailbox.

If you deploy this actor to Apify platform then you can setup a scheduler for early
morning.
```javascript
const Apify = require('apify');

const YOUR_MAIL = 'john.doe@example.com';

Apify.main(async () => {
    // Start browser.
    const browser = await Apify.launchPuppeteer({ headless: true });

    // Load Kraken and get last traded price of BTC.
    const page = await browser.newPage();
    await page.goto('https://www.kraken.com/charts');
    const tradedPricesHtml = await page.$eval('#ticker-top ul', el => el.outerHTML);

    console.log('Calling another actor. This may take a few seconds...');
    // Send prices to your email. For that, you can use an actor we already
    // have available on the platform under the name: apify/send-mail.
    // The second parameter to the Apify.call() invocation is the actor's
    // desired input. You can find the required input parameters by checking
    // the actor's documentation page: https://www.apify.com/apify/send-mail
    await Apify.call('apify/send-mail', {
        to: YOUR_MAIL,
        subject: 'Kraken.com BTC',
        html: `<h1>Kraken.com BTC</h1>${tradedPricesHtml}`,
    });

    console.log('Actor successfully called. Go check your email.');
});
```

### 7 - Run actor as an API
This example shows shows an actor that has short runtime - just few seconds. It opens a webpage
http://goldengatebridge75.org/news/webcam.html that contains webcam stream from Golden Gate
bridge, takes a screenshot and saves it as output. This makes actor executable on Apify platform
synchronously with a single request that also returns its output.

Example is shared in library under https://www.apify.com/apify/example-golden-gate-webcam
so you can easily run it with request to
https://api.apify.com/v2/acts/apify~example-golden-gate-webcam/run-sync?token=[YOUR_API_TOKEN]
```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Start browser.
    const browser = await Apify.launchPuppeteer({ headless: true });

    // Load http://goldengatebridge75.org/news/webcam.html and get an iframe
    // containing webcam stream.
    console.log('Opening page.');
    const page = await browser.newPage();
    await page.goto('http://goldengatebridge75.org/news/webcam.html');
    const iframe = (await page.frames()).pop();

    // Get webcam image element handle.
    const imageElementHandle = await iframe.$('.VideoColm img');

    // Give the webcam image some time to load.
    console.log('Waiting for some time...');
    await Apify.utils.sleep(3000);

    // Get a screenshot of that image.
    const imageBuffer = await imageElementHandle.screenshot();
    console.log('Screenshot captured.');

    // Save it as an OUTPUT. Just as INPUT, OUTPUT has a special meaning.
    // Anything you save as an OUTPUT to KeyValueStore will be sent to you
    // as an API response once the actor finishes its run, if you use the
    // run-sync API. This way, you can really Apify any website.
    await Apify.setValue('OUTPUT', imageBuffer, { contentType: 'image/jpeg' });
    console.log('Actor finished.');
});
```

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
