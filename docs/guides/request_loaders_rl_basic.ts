import { RequestList } from 'crawlee';

// Open a request list with a static set of URLs.
// The name is used to persist the list's state in the default key-value store.
const requestList = await RequestList.open('my-list', [
    'https://crawlee.dev/',
    'https://crawlee.dev/docs',
    'https://crawlee.dev/api',
]);

// Iterate over the requests manually (a crawler does this for you under the hood).
for await (const request of requestList) {
    console.log(request.url);
    await requestList.markRequestAsHandled(request);
}
