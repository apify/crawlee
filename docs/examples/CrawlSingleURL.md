---
id: crawl-single-url
title: Crawl a single URL
---

This example uses the `request-promise` library to grab the HTML of a web page.

```javascript
const Apify = require("apify");
const request = require("request-promise");

Apify.main(async () => {
    // Get the HTML of a web page
    const html = await request("https://www.example.com");
});
```

If you don't want to hard-code the URL into the script, refer to the [Accept User Input](accept-user-input) example.
