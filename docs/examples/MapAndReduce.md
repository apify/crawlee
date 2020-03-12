---
id: map-reduce
title: Dataset Map and Reduce methods
---

This example shows an easy usage of [Apify Dataset](https://docs.apify.com/storage/dataset) [Map](https://sdk.apify.com/docs/api/dataset#map) and
[Reduce](https://sdk.apify.com/docs/api/dataset#reduce) methods. Both methods can be used to simplify the process of
dataset results workflow and both can be called on the [Dataset](https://sdk.apify.com/docs/api/dataset) directly.

Important to mention is that both functions just return a new result
 (map returns a new array and the reduce method basically anything),
but both methods don't update the dataset in any way.

Examples for both methods are going to be demonstrated on a simple Dataset that contains results of a
scraped page with the `URL` and hypothetical number of h1 - h3 header elements under `headingCount` key.

```javascript
const datasetItems = [
    {
        "url": "https://apify.com/",
        "headingCount": 11,
    },
    {
        "url": "https://apify.com/storage",
        "headingCount": 8,
    },
    {
        "url": "https://apify.com/proxy",
        "headingCount": 4,
    }];
```

The Dataset Map method is very similar to standard mapping methods on an Array.
It Produces a new array of values by mapping each value in the list through a transformation function
 and options parameter.
The map method used to check if are there more than 5 header elements on each page in the incoming example.

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // open dataset
    const dataSet = await Apify.openDataset();
    // setting items to dataSet
    await dataSet.pushData(datasetItems); // <-- insert example dataset items

    // calling map function and filtering through mapped items
    const pagesWithMoreThan5headers = (await dataSet.map(item => item.headingCount)).filter(count => count > 5);
});
```

The `pagesWithMoreThan5headers` variable will be array of heading counts where number of headers is greater than 5.

```javascript
[ 11, 8 ]
```

The Dataset Reduce method does not produce a new array of values but reduces a list of values down to a single value.
It also iterates through dataset items. It uses the "memo" argument to send the updated item to the next iteration
because the item is reduced (through away) in each iteration.
The reduce method is used to get the number of all headers from scraped pages (all items in the dataset) in this example.

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // open dataset
    const dataSet = await Apify.openDataset();

    // setting items to dataSet
    await dataSet.pushData(datasetItems); // <-- insert example dataset items

    // calling reduce function and using memo to calculate number of headers
    const pagesHeadingCount = await dataSet.reduce((memo, value)=> {
        memo += value.headingCount;
        return memo;
    }, 0);

});
```

The original dataset will be reduced to a single value `pagesHeadingCount` which contains
the count of all headers  for all scraped pages (all dataset items).

```javascript
23
```
