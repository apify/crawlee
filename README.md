# Apify SDK: The scalable web crawling and scraping library for JavaScript
<!-- Mirror this part to src/index.js -->

[![npm version](https://badge.fury.io/js/apify.svg)](https://www.npmjs.com/package/apify)
[![Build Status](https://travis-ci.org/apifytech/apify-js.svg?branch=master)](https://travis-ci.org/apifytech/apify-js)

Apify SDK simplifies the development of web crawlers, scrapers, data extractors and web automation jobs.
It provides tools to manage and automatically scale a pool of headless Chrome / Puppeteer instances,
to maintain queues of URLs to crawl, store crawling results to a local filesystem or into the cloud,
rotate proxies and much more.
The SDK is available as the <a href="https://www.npmjs.com/package/apify" target="_blank"><code>apify</code></a> NPM package.
It can be used either stand-alone in your own applications
or in <a href="https://www.apify.com/docs/actor" target="_blank">actors</a>
running on the <a href="https://www.apify.com/" target="_blank">Apify Cloud</a>.

**View full documentation, guides and examples on the dedicated <a href="https://sdk.apify.com" target="_blank">Apify SDK project website</a>**

## Motivation

Thanks to tools like <a href="https://github.com/GoogleChrome/puppeteer" target="_blank">Puppeteer</a> or
<a href="https://www.npmjs.com/package/cheerio" target="_blank">Cheerio</a>,
it is easy to write Node.js code to extract data from web pages.
But eventually things will get complicated. For example, when you try to:

* Perform a deep crawl of an entire website using a persistent queue of URLs.
* Run your scraping code on a list of 100k URLs in a CSV file,
  without losing any data when your code crashes.
* Rotate proxies to hide your browser origin.
* Schedule the code to run periodically and send notification on errors.
* Disable browser fingerprinting protections used by websites.

Python has <a href="https://scrapy.org/" target="_blank">Scrapy</a> for these tasks, but there was no
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
    <a href="https://sdk.apify.com/docs/api/basiccrawler"><code>BasicCrawler</code></a>
    - Provides a simple framework for the parallel crawling of web pages
    whose URLs are fed either from a static list or from a dynamic queue of URLs.
    This class serves as a base for more complex crawlers (see below).
  </li>
  <li>
    <a href="https://sdk.apify.com/docs/api/cheeriocrawler"><code>CheerioCrawler</code></a>
    - Enables the parallel crawling of a large number of web pages
    using the <a href="https://www.npmjs.com/package/cheerio" target="_blank">cheerio</a>
    HTML parser.
    This is the most efficient web crawler, but it does not work on websites that require JavaScript.
  </li>
  <li>
    <a href="https://sdk.apify.com/docs/api/puppeteercrawler"><code>PuppeteerCrawler</code></a>
    - Enables the parallel crawling of a large number of web pages using the headless Chrome browser
    and <a href="https://github.com/GoogleChrome/puppeteer">Puppeteer</a>.
    The pool of Chrome browsers is automatically scaled up and down based on available system resources.
  </li>
  <li>
    <a href="https://sdk.apify.com/docs/api/puppeteerpool"><code>PuppeteerPool</code></a>
    - Provides web browser tabs for user jobs
    from an automatically-managed pool of Chrome browser instances, with configurable browser recycling and retirement policies.
    Supports reuse of the disk cache to speed up the crawling of websites and reduce proxy bandwidth.
  </li>
  <li>
    <a href="https://sdk.apify.com/docs/api/requestlist"><code>RequestList</code></a>
    - Represents a list of URLs to crawl. The URLs can be passed in code or in a text file hosted on the web.
    The list persists its state so that crawling can resume
    when the Node.js process restarts.
  </li>
  <li>
    <a href="https://sdk.apify.com/docs/api/requestqueue"><code>RequestQueue</code></a>
    - Represents a queue of URLs to crawl, which is stored either on a local filesystem or in the <a href="https://www.apify.com" target="_blank">Apify Cloud</a>.
    The queue is used for deep crawling of websites, where you start with
    several URLs and then recursively follow links to other pages.
    The data structure supports both breadth-first and depth-first crawling orders.
  </li>
  <li>
    <a href="https://sdk.apify.com/docs/api/dataset"><code>Dataset</code></a>
    - Provides a store for structured data and enables their
    export to formats like JSON, JSONL, CSV, XML, Excel or HTML.
    The data is stored on a local filesystem or in the Apify Cloud.
    Datasets are useful for storing and sharing large tabular crawling results,
    such as a list of products or real estate offers.
  </li>
  <li>
    <a href="https://sdk.apify.com/docs/api/keyvaluestore"><code>KeyValueStore</code></a>
    - A simple key-value store for arbitrary data records or files, along with their MIME content type.
    It is ideal for saving screenshots of web pages, PDFs or to persist the state of your crawlers.
    The data is stored on a local filesystem or in the Apify Cloud.
  </li>
  <li>
    <a href="https://sdk.apify.com/docs/api/autoscaledpool"><code>AutoscaledPool</code></a>
    - Runs asynchronous background tasks, while automatically adjusting the concurrency
    based on free system memory and CPU usage. This is useful for running web scraping tasks
    at the maximum capacity of the system.
  </li>
  <li>
    <a href="https://sdk.apify.com/docs/api/puppeteer"><code>Puppeteer Utils</code></a>
    - Provides several helper functions useful for web scraping. For example, to inject jQuery into web pages
    or to hide browser origin.
  </li>
  <li>
    Additionally, the package provides various helper functions to simplify
    running your code on the Apify Cloud and thus
    take advantage of its pool of proxies, job scheduler, data storage, etc.
    For more information,
    see the <a href="https://sdk.apify.com">Apify SDK Programmer's Reference</a>.
  </li>
</ul>

## Getting Started
The Apify SDK requires <a href="https://nodejs.org/en/" target="_blank">Node.js</a> 8 or later.

### Local stand-alone usage

Add Apify SDK to any Node.js project by running:

```bash
npm install apify --save
```

Run the following example to perform a recursive crawl of a website using Puppeteer.
For more examples showcasing various features of the Apify SDK,
[see the Examples section of the documentation](https://sdk.apify.com/docs/examples/basiccrawler).

```javascript
const Apify = require('apify');

Apify.main(async () => {
    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest({ url: 'https://www.iana.org/' });
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

When you run the example, you should see Apify SDK automating a Chrome browser.

![Chrome Scrape](https://sdk.apify.com/img/chrome_scrape.gif)

By default, Apify SDK stores data to
`./apify_storage` in the current working directory.
You can override this behavior by setting either the
`APIFY_LOCAL_STORAGE_DIR` or `APIFY_TOKEN` environment variable.
For details, see [Environment variables](https://sdk.apify.com/docs/guides/environmentvariables)
and [Data storage](https://sdk.apify.com/docs/guides/datastorage).

### Local usage with Apify command-line interface (CLI)

To avoid the need to set the environment variables manually,
to create a boilerplate of your project,
and to enable pushing and running your code on the
<a href="https://www.apify.com" target="_blank">Apify Cloud</a>,
you can use the
<a href="https://github.com/apifytech/apify-cli" target="_blank">Apify command-line interface</a>
(CLI) tool.

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
```
```bash
apify push
```

Your script will be uploaded to the Apify Cloud and built there so that it can be run.
For more information, view the
<a href="https://www.apify.com/docs/cli" target="_blank">Apify CLI</a>
and
<a href="https://www.apify.com/docs/actor" target="_blank">Apify Actor</a>
documentation.

### Usage on the Apify Cloud

You can also develop your web scraping project
in an online code editor directly on the
<a href="https://www.apify.com" target="_blank">Apify Cloud</a>.
You'll need to have an Apify Account.
Go to <a href="https://my.apify.com/actors" target="_blank">Actors</a>,
page in the app, click <i>Create new</i> and then go to the
<i>Source</i> tab and start writing your code or paste one of the examples from the Examples section.

For more information, view the
<a href="https://www.apify.com/docs/actor#quick-start" target="_blank">Apify actors quick start guide</a>.

## Support

If you find any bug or issue with the Apify SDK, please [submit an issue on GitHub](https://github.com/apifytech/apify-js/issues).
For questions, you can ask on [Stack Overflow](https://stackoverflow.com/questions/tagged/apify) or contact support@apify.com

## Contributing

Your code contributions are welcome and you'll be praised to eternity!
If you have any ideas for improvements, either submit an issue or create a pull request.
For contribution guidelines and the code of conduct,
see [CONTRIBUTING.md](https://github.com/apifytech/apify-js/blob/master/CONTRIBUTING.md).

## License

This project is licensed under the Apache License 2.0 -
see the [LICENSE.md](https://github.com/apifytech/apify-js/blob/master/LICENSE.md) file for details.

## Acknowledgments

Many thanks to [Chema Balsas](https://www.npmjs.com/~jbalsas) for giving up the `apify` package name
on NPM and renaming his project to [jsdocify](https://www.npmjs.com/package/jsdocify).
