import { CheerioCrawler } from 'crawlee';
import { URL } from 'node:url';

const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 20,
    async requestHandler({ request, $ }) {
        const title = $('title').text();
        console.log(`The title of "${request.url}" is: ${title}.`);

        const links = $('a[href]')
            .map((_, el) => $(el).attr('href'))
            .get();

        // Besides resolving the URLs, we now also need to
        // grab their hostname for filtering.
        const { hostname } = new URL(request.loadedUrl);
        const absoluteUrls = links.map(
            (link) => new URL(link, request.loadedUrl),
        );

        // We use the hostname to filter links that point
        // to a different domain, even subdomain.
        const sameHostnameLinks = absoluteUrls
            .filter((url) => url.hostname === hostname)
            .map((url) => ({ url: url.href }));

        // Finally, we have to add the URLs to the queue
        await crawler.addRequests(sameHostnameLinks);
    },
});

await crawler.run(['https://crawlee.dev']);
