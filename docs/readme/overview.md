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
