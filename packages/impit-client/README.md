# @crawlee/impit-client

This package provides a Crawlee-compliant `HttpClient` interface for the [`impit`](https://www.npmjs.com/package/impit) package.

To use the `impit` package directly without Crawlee, check out [`impit`](https://www.npmjs.com/package/impit) on NPM.

## Example usage

Simply pass the `ImpitHttpClient` instance to the `httpClient` option of the crawler constructor:

```typescript
import { CheerioCrawler, Dictionary } from '@crawlee/cheerio';
import { ImpitHttpClient, Browser } from '@crawlee/impit-client';

const crawler = new CheerioCrawler({
    httpClient: new ImpitHttpClient({
        browser: Browser.Firefox,
        http3: true,
        ignoreTlsErrors: true,
    }),
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
