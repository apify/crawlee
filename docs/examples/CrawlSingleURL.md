---
id: crawl-single-url
title: Crawl a single URL
---

```javascript
const Apify = require("apify");
const request = require("request-promise");

Apify.main(async () => {
    // Get the HTML of a web page
    const html = await request("https://www.google.com");
});
```

```javascript
// Get a URL from the INPUT data
const { url } = await Apify.getInput();

// Get the HTML of a web page
const html = await request(url);
```
