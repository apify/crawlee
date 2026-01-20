# @crawlee/got-scraping-client

This package provides a Crawlee-compliant `HttpClient` interface for the [`got-scraping`](https://www.npmjs.com/package/got-scraping) package.

To use the `got-scraping` package directly without Crawlee, check out [`got-scraping`](https://www.npmjs.com/package/got-scraping) on NPM.

## Example usage

Simply pass the `GotScrapingHttpClient` instance to the `httpClient` option of the crawler constructor:

```typescript
import { CheerioCrawler, Dictionary } from '@crawlee/cheerio';
import { GotScrapingHttpClient, Browser } from '@crawlee/got-scraping-client';

const crawler = new CheerioCrawler({
    httpClient: new GotScrapingHttpClient(),
    async requestHandler({ $, request }) {
        // Extract the title of the page.
        const title = $('title').text();
        console.log(`Title of the page ${request.url}: ${title}`);
    },
});

crawler.run([
    'http://www.example.com/page-1',
    'http://www.example.com/page-2',
]);
```
