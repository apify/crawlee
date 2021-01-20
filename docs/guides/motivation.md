---
id: motivation
title: Motivation
---

Thanks to tools like [Playwright](https://github.com/microsoft/playwright), [Puppeteer](https://github.com/puppeteer/puppeteer) or
[Cheerio](https://www.npmjs.com/package/cheerio), it is easy to write Node.js code to extract data from web pages. But
eventually things will get complicated. For example, when you try to:

-   Perform a deep crawl of an entire website using a persistent queue of URLs.
-   Run your scraping code on a list of 100k URLs in a CSV file, without losing any data when your code crashes.
-   Rotate proxies to hide your browser origin and keep user-like sessions.
-   Disable browser fingerprinting protections used by websites.

Python has [Scrapy](https://scrapy.org/) for these tasks, but there was no such library for **JavaScript, the language of
the web**. The use of JavaScript is natural, since the same language is used to write the scripts as well as the data extraction code running in a
browser.

The goal of the Apify SDK is to fill this gap and provide a toolbox for generic web scraping, crawling and automation tasks in JavaScript. So don't
reinvent the wheel every time you need data from the web, and focus on writing code specific to the target website, rather than developing
commonalities.
