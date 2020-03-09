---
id: map-reduce
title: Dataset Map and Reduce methods
---

This example shows an easy usage of [Apify Dataset](https://docs.apify.com/storage/dataset) [Map](https://sdk.apify.com/docs/api/dataset#map) and
[Reduce](https://sdk.apify.com/docs/api/dataset#reduce) methods. Both methods can be used to simplify the process of
dataset results workflow and both can be called on the [Dataset](https://sdk.apify.com/docs/api/dataset) directly.

Important to mention is that both functions just return a new array with the result,
they don't update the dataset in any way.

Examples for both methods are going to be demonstrated on a simple Dataset that contains results of a
scraped page with the URL and number of h1 - h3 header elements.

```javascript
const datasetItems = [
    {
        "url": "https://apify.com/",
        "h1texts": 1,
        "h2texts": 3,
        "h3texts": 7
    },
    {
        "url": "https://apify.com/storage",
        "h1texts": 1,
        "h2texts": 4,
        "h3texts": 3
    },
    {
        "url": "https://apify.com/proxy",
        "h1texts": 1,
        "h2texts": 3,
        "h3texts": 3
    }];
```


The Dataset Map method is very similar to standard mapping methods on an Array.
It Produces a new array of values by mapping each value in the list through a transformation function
 and options parameter.
In the incoming example is the map method used to check if are there more than 3 elements for
a header category at each page.

```javascript
Apify.main(async () => {
    const maxOfHeaders = 3;
    const maxHeaderMessage = 'There are more than 3 of these elements here!';

    // open dataset
    const dataSet = await Apify.openDataset();
    // setting items to dataSet
    await dataSet.pushData(datasetItems); // <-- insert example dataset items

    // call map function with iteratee function as a parameter
    const pageHeadersStatistics = await dataSet.map((element, index) => {
        if (element.h1texts > maxOfHeaders) element.h1texts = maxHeaderMessage;
        if (element.h2texts > maxOfHeaders) element.h2texts = maxHeaderMessage;
        if (element.h3texts > maxOfHeaders) element.h3texts = maxHeaderMessage;

        return element;
    });

});
```

The pageHeaderStatistic variable will consist of new items where when there are more then 3 elements for the header type
there will be a info message instead of number of elements.


```javascript
[
  {
    url: 'https://apify.com/',
    h1texts: 1,
    h2texts: 3,
    h3texts: 'There are more than 3 of these elements here!'
  },
  {
    url: 'https://apify.com/storage',
    h1texts: 1,
    h2texts: 'There are more than 3 of these elements here!',
    h3texts: 3
  },
  {
    url: 'https://apify.com/proxy',
    h1texts: 1,
    h2texts: 3,
    h3texts: 3
  }
]
```

The Dataset Reduce method does not produce a new array of values but reduces a list of values down to a single value.
It also iterates through dataset items. It uses the "memo" argument to send the updated item to the next iteration
because the item is reduced (through away) in each iteration.
The reduce method is used to get the header statistics of all scraped pages (all items in the dataset) in this example.

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // open dataset
    const dataSet = await Apify.openDataset();

    // setting items to dataSet
    await dataSet.pushData(datasetItems); // <-- insert example dataset items

    let headerStatistics = {
        h1: 0,
        h2: 0,
        h3: 0,
    };

    // call reduce function with iteratee parameter
    const pagesHeadersStatistics = await dataSet.reduce((memo, value, index)=> {
        memo.h1 += value.h1texts;
        memo.h2 += value.h2texts;
        memo.h3 += value.h3texts;

        return memo;
    }, headerStatistics);

});
```

The original dataset will be reduced to a single item which contains
the number headers type (h1 - h3) for all scraped pages (all dataset items).

```javascript
{ h1: 3, h2: 10, h3: 13 }
```
