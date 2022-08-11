import { CheerioCrawler } from 'crawlee';
import { URL } from 'node:url';

const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 20,
    async requestHandler({ request, $ }) {
        const title = $('title').text();
        console.log(`The title of "${request.url}" is: ${title}.`);

        // Without enqueueLinks, we first have to extract all
        // the URLs from the page with Cheerio.
        const links = $('a[href]')
            .map((_, el) => $(el).attr('href'))
            .get();

        // Then we need to resolve relative URLs,
        // otherwise they would be unusable for crawling.
        const absoluteUrls = links
            .map((link) => new URL(link, request.loadedUrl).href);

        // Finally, we have to add the URLs to the queue
        await crawler.addRequests(absoluteUrls);
    },
});

await crawler.run(['https://crawlee.dev']);
