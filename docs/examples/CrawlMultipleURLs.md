---
id: crawl-multiple-urls
title: Crawl multiple URLs
---

<!--DOCUSAURUS_CODE_TABS-->

<!-- BasicCrawler -->

```javascript
const Apify = require("apify");
const request = require("request-promise");

Apify.main(async () => {

  const requestList = new Apify.RequestList({
    sources: [
        { url: 'http://www.example.com/page-1' },
        { url: 'http://www.example.com/page-2' },
        { url: 'http://www.example.com/page-3' }
      ]
    });

  await requestList.initialize();

  // Function called for each URL
  const handleRequestFunction = async ({ request }) => {
    console.log(request.url);
  });

  const crawler = new Apify.BasicCrawler({
    requestList,
    handleRequestFunction
  });

  // Run the crawler
  await crawler.run();

});
```

<!-- CheerioCrawler -->

```javascript
const Apify = require("apify");

Apify.main(async () => {

  const requestList = new Apify.RequestList({
    sources: [
        { url: 'http://www.example.com/page-1' },
        { url: 'http://www.example.com/page-2' },
        { url: 'http://www.example.com/page-3' }
      ]
    });

  await requestList.initialize();

  // Function called for each URL
  const handlePageFunction = async ({ request, $ }) => {
    console.log(request.url);
  });

  const crawler = new Apify.CheerioCrawler({
    requestList,
    handlePageFunction
  });

  // Run the crawler
  await crawler.run();

});
```

<!-- PuppeteerCrawler -->

```javascript
const Apify = require("apify");

Apify.main(async () => {

  const requestList = new Apify.RequestList({
    sources: [
        { url: 'http://www.example.com/page-1' },
        { url: 'http://www.example.com/page-2' },
        { url: 'http://www.example.com/page-3' }
      ]
    });

  await requestList.initialize();

  // Function called for each URL
  const handlePageFunction = async ({ request, page }) => {
    console.log(request.url);
  });

  const crawler = new Apify.PuppeteerCrawler({
    requestList,
    handlePageFunction
  });

  // Run the crawler
  await crawler.run();

});
```

<!--END_DOCUSAURUS_CODE_TABS-->

```javascript
const { urls } = await Apify.getInput();

// Convert array of URLs into array of objects
const sources = urls.map(url => {
    return {
        url
    };
});

const requestList = new Apify.RequestList({
    sources
});
```
