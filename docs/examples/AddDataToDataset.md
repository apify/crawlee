---
id: add-data-dataset
title: Add data to dataset
---

This example opens a dataset named "my-cool-dataset" and adds the URL of each request to it. If the dataset doesn't exist, it will be created.

```javascript
const Apify = require("apify");

Apify.main(async () => {
    const requestList = new Apify.RequestList({
        sources: [
            { url: "http://www.example.com/page-1" },
            { url: "http://www.example.com/page-2" },
            { url: "http://www.example.com/page-3" }
        ]
    });

    await requestList.initialize();

    // Function called for each URL
    const handleRequestFunction = async ({ request }) => {
        // Open a dataset
        const dataset = await Apify.openDataset("my-cool-dataset");

        // Add data to dataset
        await dataset.pushData({ url: request.url });
    };

    const crawler = new Apify.BasicCrawler({
        requestList,
        handleRequestFunction
    });

    // Run the crawler
    await crawler.run();
});
```

Each item in this dataset will be saved to its own file in the following directory:

```bash
{PROJECT_FOLDER}/apify_storage/key-datasets-stores/my-cool-dataset/
```
