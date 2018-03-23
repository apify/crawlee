# apify: Apify JavaScript SDK
<!-- Mirror this part to src/index.js -->

[![npm version](https://badge.fury.io/js/apify.svg)](http://badge.fury.io/js/apify)
[![Build Status](https://travis-ci.org/apifytech/apify-js.svg)](https://travis-ci.org/apifytech/apify-js)


The `apify` NPM package enables development of web scrapers and crawlers,
either locally or running on <a href="https://www.apify.com/docs/actor" target="_blank">Apify Actor</a> -
a serverless computing platform that enables execution of arbitrary code in the cloud.
The package provides helper functions to launch web browsers with proxies, access the storage etc. Note that the usage of the package is optional, you can create acts without it.

Complete documentation of this package is available at https://www.apify.com/docs/sdk/apify-runtime-js/latest

For more information about the Apify Actor platform, please see https://www.apify.com/docs/actor

## Common use-cases
<!-- Mirror this part to src/index.js -->

Main goal of this package is to help with implementation of web scraping and automation projects. Some of the
most common use-cases are:

<ul>
  <li>
    If you need to process high volume of <strong>asynchronous tasks in parallel</strong> then take a
    look at <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#AutoscaledPool">AutoscaledPool</a>. This class executes defined tasks in a pool
    which size is scaled based on available memory and CPU.
  </li>
  <li>
    If you want to <strong>crawl</strong> a list of urls using for example <a href="https://www.npmjs.com/package/request" target="_blank">
    Request</a> package then import those url as a <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestList">RequestList</a> and then use
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#BasicCrawler">BasicCrawler</a> to process them in a pool.
  </li>
  <li>
    If you want to crawl a list of urls but you need a real <strong>browser</strong>. Then use
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#PuppeteerCrawler">PuppeteerCrawler</a> which helps you to process a <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestList">RequestList</a>
    using <a href="https://github.com/GoogleChrome/puppeteer" target="_blank">Puppeteer</a> (headless Chrome browser).
  </li>
</ul>

## Puppeteer
<!-- Mirror this part to src/index.js -->

For those who are using <a href="https://github.com/GoogleChrome/puppeteer" target="_blank">Puppeteer</a> (headless Chrome browser)
we have few helper classes and functions:

<ul>
  <li>
    `Apify.launchPuppeteer()` function starts new instance of Puppeteer browser and returns its browser object.
  </li>
  <li>
    <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#PuppeteerPool">PuppeteerPool</a> helps to mantain a pool of Puppeteer instances. This is usefull
    when you need to restart browser after certain number of requests to rotate proxy servers.
  </li>
  <li>
      <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#PuppeteerCrawler">PuppeteerCrawler</a> helps to crawl a <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#RequestList">RequestList</a>
      in a autoscaled pool.
  </li>
</ul>

## Examples

Directory `/examples` of this repo contains examples of different usages of this package.