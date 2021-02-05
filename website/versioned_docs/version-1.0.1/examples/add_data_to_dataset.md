---
id: version-1.0.1-add-data-to-dataset
title: Add data to dataset
original_id: add-data-to-dataset
---

This example saves data to the default dataset. If the dataset doesn't exist, it will be created. You can save data to custom datasets by using
[`Apify.openDataset()`](../api/apify#opendataset)

```javascript
const Apify = require('apify');

Apify.main(async () => {
    const requestList = await Apify.openRequestList('start-urls', [
        { url: 'http://www.example.com/page-1' },
        { url: 'http://www.example.com/page-2' },
        { url: 'http://www.example.com/page-3' },
    ]);

    // Function called for each URL
    const handlePageFunction = async ({ request, body }) => {
        // Save data to default dataset
        await Apify.pushData({
            url: request.url,
            html: body,
        });
    };

    const crawler = new Apify.CheerioCrawler({
        requestList,
        handlePageFunction,
    });

    // Run the crawler
    await crawler.run();
});
```

Each item in this dataset will be saved to its own file in the following directory:

```bash
{PROJECT_FOLDER}/apify_storage/datasets/default/
```
