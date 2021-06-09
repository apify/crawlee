---
id: version-0.22.4-map-and-reduce
title: Dataset Map and Reduce methods
original_id: map-and-reduce
---

This example shows an easy use-case of the [Apify dataset](https://docs.apify.com/storage/dataset) [`map`](/docs/api/dataset#map) and
[`reduce`](/docs/api/dataset#reduce) methods. Both methods can be used to simplify the dataset results workflow process. Both can be called on the
[dataset](/docs/api/dataset) directly.

Important to mention is that both methods return a new result (`map` returns a new array and `reduce` can return any type) - neither method updates
the dataset in any way.

Examples for both methods are demonstrated on a simple dataset containing the results scraped from a page: the `URL` and a hypothetical number of
`h1` - `h3` header elements under the `headingCount` key.

This data structure is stored in the default dataset under `{PROJECT_FOLDER}/apify_storage/datasets/default/`. If you want to simulate the
functionality, you can use the [`dataset.PushData()`](/docs/api/dataset#pushdata) method to save the example `JSON array` to your dataset.

```json
[
    {
        "url": "https://apify.com/",
        "headingCount": 11
    },
    {
        "url": "https://apify.com/storage",
        "headingCount": 8
    },
    {
        "url": "https://apify.com/proxy",
        "headingCount": 4
    }
]
```

### Map

The dataset `map` method is very similar to standard Array mapping methods. It produces a new array of values by mapping each value in the existing
array through a transformation function and an options parameter.

The `map` method used to check if are there more than 5 header elements on each page:

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // open default dataset
    const dataSet = await Apify.openDataset();

    // calling map function and filtering through mapped items
    const moreThan5headers = (await dataSet.map(item => item.headingCount)).filter(count => count > 5);

    // saving result of map to default Key-value store
    await Apify.setValue('pages_with_more_than_5_headers', moreThan5headers);
});
```

The `moreThan5headers` variable is an array of `headingCount` attributes where the number of headers is greater than 5.

The `map` method's result value saved to the [`key-value store`](/docs/api/key-value-store) should be:

```javascript
[11, 8];
```

### Reduce

The dataset `reduce` method does not produce a new array of values - it reduces a list of values down to a single value. The method iterates through
the items in the dataset using the [`memo` argument](/docs/api/dataset#datasetreduceiteratee-memo-options). After performing the necessary
calculation, the `memo` is sent to the next iteration, while the item just processed is reduced (removed).

Using the `reduce` method to get the total number of headers scraped (all items in the dataset):

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // open default dataset
    const dataSet = await Apify.openDataset();

    // calling reduce function and using memo to calculate number of headers
    const pagesHeadingCount = await dataSet.reduce((memo, value) => {
        memo += value.headingCount;
        return memo;
    }, 0);

    // saving result of reduce to default Key-value store
    await Apify.setValue('pages_heading_count', pagesHeadingCount);
});
```

The original dataset will be reduced to a single value, `pagesHeadingCount`, which contains the count of all headers for all scraped pages (all
dataset items).

The `reduce` method's result value saved to the [key-value store](/docs/api/key-value-store) should be:

```javascript
23;
```
