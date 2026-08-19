import { RequestQueue } from 'crawlee';

// Open the default request queue associated with the crawler run
const requestQueue = await RequestQueue.open();

// Enqueue the initial batch of requests (could be an array of just one)
await requestQueue.addRequests([
    { url: 'https://example.com/1' },
    { url: 'https://example.com/2' },
    { url: 'https://example.com/3' },
]);

// Open the named request queue
const namedRequestQueue = await RequestQueue.open('named-queue');

// Remove the named request queue
await namedRequestQueue.drop();
