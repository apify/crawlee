import { CheerioCrawler } from 'crawlee';

const crawler = new CheerioCrawler({
    // Let the crawler know it can run up to 100 requests concurrently at any time
    maxConcurrency: 100,
    // ...but also ensure the crawler never exceeds 250 requests per minute
    maxRequestsPerMinute: 250,
});
