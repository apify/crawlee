---
id: map-reduce
title: Dataset Map and Reduce methods
---

This example shows an easy usage of Apify Dataset [Map](https://sdk.apify.com/docs/api/dataset#map) and
[Reduce](https://sdk.apify.com/docs/api/dataset#reduce) methods. Both methods can be used to simplify the process of
dataset results workflow because they can be called on the Apify DataSet directly.

Important to mention is that both functions just return a new array with the result,
they don't update the dataset in any way.

Examples for both methods are going to be demonstrated on a simple Dataset that contains results of a
scraped page with the URL, the title of the page and array of h1 - h3 header texts.

```json
{
  "url": "https://apify.com/",
  "title": "Web Scraping, Data Extraction and Automation · Apifyapify_animation_01_02",
  "h1texts": [
    "Extract data from any website"
  ],
  "h2texts": [
    "Turn any website into an API",
    "How can Apifyhelp your business?",
    "Products"
  ],
  "h3texts": [
    "Web scraping",
    "Web automation",
    "Web integration",
    "Actors",
    "Proxy",
    "Storage",
    "Apify SDK"
  ]
}
```


The Dataset Map method is very similar to standard map() methods on an Array.
It Produces a new array of values by mapping each value in list through a transformation function and options parameter.
In the incoming example is the map method used to get a new items with calculated header statistics for each page.

```javascript
const Apify = require('apify');

Apify.main(async () => {
   // open dataset
       const dataSet = await Apify.openDataset();
       // call map function with iteratee parameter
       const pageHeadersStatistics = await dataSet.map((element, index) => {
           element.headerStatistics = {
               h1Count: element.h1texts.length,
               h2Count: element.h2texts.length,
               h3Count: element.h3texts.length,
           };
           return element;
       });
});
```

The original dataset item will be enhanced by key "headerStatistics" which contains the number
 of elements for each header type (h1 - h3).

```javascript
{   url: 'https://apify.com/',
    title:'Web Scraping, Data Extraction and Automation · Apifyapify_animation_01_02',
    h1texts: [ 'Extract data from any website' ],
    h2texts:
     [ 'Turn any website into an API',
       'How can Apifyhelp your business?',
       'Products' ],
    h3texts:
     [ 'Web scraping',
       'Web automation',
       'Web integration',
       'Actors',
       'Proxy',
       'Storage',
       'Apify SDK' ],
    headerStatistics: { h1Count: 1, h2Count: 3, h3Count: 7 }
}
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
       // call reduce function with iteratee parameter
  const pagesHeadersStatistics = await dataSet.reduce((memo, value, index)=> {
        let toReturn;
        if (index === 0) {
           value.headerStatistics = {
                h1: value.h1texts.length,
                h2: value.h2texts.length,
                h3: value.h3texts.length
            };
            value.testField = 'test field';
            toReturn = value;
        } else {
            memo.headerStatistics.h1 += value.h1texts.length;
            memo.headerStatistics.h2 += value.h2texts.length;
            memo.headerStatistics.h3 += value.h3texts.length;
            toReturn = memo;
        }

        return toReturn;
    }, null);
});
```

The original dataset will be reduced to a single item with a key "headerStatistics" which contains
the number headers type (h1 - h3) for all scraped pages (all dataset items).


```javascript
{   url: 'https://apify.com/',
    title:'Web Scraping, Data Extraction and Automation · Apifyapify_animation_01_02',
    h1texts: [ 'Extract data from any website' ],
    h2texts:
     [ 'Turn any website into an API',
       'How can Apifyhelp your business?',
       'Products' ],
    h3texts:
     [ 'Web scraping',
       'Web automation',
       'Web integration',
       'Actors',
       'Proxy',
       'Storage',
       'Apify SDK' ],
    headerStatistics: { h1: 22, h2: 63, h3: 79 }
}
```
