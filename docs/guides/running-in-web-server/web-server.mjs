import { CheerioCrawler, log } from 'crawlee';
import { createServer } from 'http';

// We will bound an HTTP response that we want to send to the Request.uniqueKey
const requestsToResponses = new Map();

const crawler = new CheerioCrawler({
    keepAlive: true,
    requestHandler: async ({ request, $ }) => {
        const title = $('title').text();
        log.info(`Page title: ${title} on ${request.url}, sending response`);

        // We will pick the response from the map and send it to the user
        // We know the response is there with this uniqueKey
        const httpResponse = requestsToResponses.get(request.uniqueKey);
        httpResponse.writeHead(200, { 'Content-Type': 'application/json' });
        httpResponse.end(JSON.stringify({ title }));
        // We can delete the response from the map now to free up memory
        requestsToResponses.delete(request.uniqueKey);
    },
});

const server = createServer(async (req, res) => {
    // We parse the requested URL from the query parameters, e.g. localhost:3000/?url=https://example.com
    const urlObj = new URL(req.url, 'http://localhost:3000');
    const requestedUrl = urlObj.searchParams.get('url');

    log.info(`HTTP request received for ${requestedUrl}, adding to the queue`);
    if (!requestedUrl) {
        log.error('No URL provided as query parameter, returning 400');
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No URL provided as query parameter' }));
        return;
    }

    // We will add it first to the map and then enqueue it to the crawler that immediately processes it
    // uniqueKey must be random so we process the same URL again
    const crawleeRequest = { url: requestedUrl, uniqueKey: `${Math.random()}` };
    requestsToResponses.set(crawleeRequest.uniqueKey, res);
    await crawler.addRequests([crawleeRequest]);
});

// Now we start the server, the crawler and wait for incoming connections
server.listen(3000, () => {
    log.info('Server is listening for user requests');
});

await crawler.run();
