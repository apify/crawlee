---
id: version-2.3.0-request-list-options
title: RequestListOptions
original_id: request-list-options
---

<a name="requestlistoptions"></a>

## Properties

### `sources`

**Type**: [`Array<(RequestOptions|Request|{requestsFromUrl: string}|string)>`](../typedefs/request-options)

An array of sources of URLs for the [`RequestList`](../api/request-list). It can be either an array of strings, plain objects that define at least the
`url` property, or an array of [`Request`](../api/request) instances.

**IMPORTANT:** The `sources` array will be consumed (left empty) after `RequestList` initializes. This is a measure to prevent memory leaks in
situations when millions of sources are added.

Additionally, the `requestsFromUrl` property may be used instead of `url`, which will instruct `RequestList` to download the source URLs from a given
remote location. The URLs will be parsed from the received response.

```
[
    // A single URL
    'http://example.com/a/b',

    // Modify Request options
    { method: PUT, 'https://example.com/put, payload: { foo: 'bar' }}

    // Batch import of URLs from a file hosted on the web,
    // where the URLs should be requested using the HTTP POST request
    { method: 'POST', requestsFromUrl: 'http://example.com/urls.txt' },

    // Batch import from remote file, using a specific regular expression to extract the URLs.
    { requestsFromUrl: 'http://example.com/urls.txt', regex: /https:\/\/example.com\/.+/ },

    // Get list of URLs from a Google Sheets document. Just add "/gviz/tq?tqx=out:csv" to the Google Sheet URL.
    // For details, see https://help.apify.com/en/articles/2906022-scraping-a-list-of-urls-from-a-google-sheets-document
    { requestsFromUrl: 'https://docs.google.com/spreadsheets/d/1GA5sSQhQjB_REes8I5IKg31S-TuRcznWOPjcpNqtxmU/gviz/tq?tqx=out:csv' }
]
```

---

### `sourcesFunction`

**Type**: [`RequestListSourcesFunction`](../typedefs/request-list-sources-function)

A function that will be called to get the sources for the `RequestList`, but only if `RequestList` was not able to fetch their persisted version (see
[`RequestListOptions.persistRequestsKey`](../typedefs/request-list-options#persistrequestskey)). It must return an `Array` of
[`Request`](../api/request) or [`RequestOptions`](../typedefs/request-options).

This is very useful in a scenario when getting the sources is a resource intensive or time consuming task, such as fetching URLs from multiple
sitemaps or parsing URLs from large datasets. Using the `sourcesFunction` in combination with `persistStateKey` and `persistRequestsKey` will allow
you to fetch and parse those URLs only once, saving valuable time when your actor migrates or restarts.

If both [`RequestListOptions.sources`](../typedefs/request-list-options#sources) and
[`RequestListOptions.sourcesFunction`](../typedefs/request-list-options#sourcesfunction) are provided, the sources returned by the function will be
added after the `sources`.

**Example:**

```javascript
// Let's say we want to scrape URLs extracted from sitemaps.

const sourcesFunction = async () => {
    // With super large sitemaps, this operation could take very long
    // and big websites typically have multiple sitemaps.
    const sitemaps = await downloadHugeSitemaps();
    return parseUrlsFromSitemaps(sitemaps);
};

// Sitemaps can change in real-time, so it's important to persist
// the URLs we collected. Otherwise we might lose our scraping
// state in case of an actor migration / failure / time-out.
const requestList = new RequestList({
    sourcesFunction,
    persistStateKey: 'state-key',
    persistRequestsKey: 'requests-key',
});

// The sourcesFunction is called now and the Requests are persisted.
// If something goes wrong and we need to start again, RequestList
// will load the persisted Requests from storage and will NOT
// call the sourcesFunction again, saving time and resources.
await requestList.initialize();
```

---

### `persistStateKey`

**Type**: `string`

Identifies the key in the default key-value store under which `RequestList` periodically stores its state (i.e. which URLs were crawled and which
not). If the actor is restarted, `RequestList` will read the state and continue where it left off.

If `persistStateKey` is not set, `RequestList` will always start from the beginning, and all the source URLs will be crawled again.

---

### `persistRequestsKey`

**Type**: `string`

Identifies the key in the default key-value store under which the `RequestList` persists its Requests during the
[`RequestList.initialize()`](../api/request-list#initialize) call. This is necessary if `persistStateKey` is set and the source URLs might potentially
change, to ensure consistency of the source URLs and state object. However, it comes with some storage and performance overheads.

If `persistRequestsKey` is not set, [`RequestList.initialize()`](../api/request-list#initialize) will always fetch the sources from their origin,
check that they are consistent with the restored state (if any) and throw an error if they are not.

---

### `state`

**Type**: [`RequestListState`](../typedefs/request-list-state)

The state object that the `RequestList` will be initialized from. It is in the form as returned by `RequestList.getState()`, such as follows:

```
{
    nextIndex: 5,
    nextUniqueKey: 'unique-key-5'
    inProgress: {
        'unique-key-1': true,
        'unique-key-4': true,
    },
}
```

Note that the preferred (and simpler) way to persist the state of crawling of the `RequestList` is to use the `stateKeyPrefix` parameter instead.

---

### `keepDuplicateUrls`

**Type**: `boolean` <code> = false</code>

By default, `RequestList` will deduplicate the provided URLs. Default deduplication is based on the `uniqueKey` property of passed source
[`Request`](../api/request) objects.

If the property is not present, it is generated by normalizing the URL. If present, it is kept intact. In any case, only one request per `uniqueKey`
is added to the `RequestList` resulting in removal of duplicate URLs / unique keys.

Setting `keepDuplicateUrls` to `true` will append an additional identifier to the `uniqueKey` of each request that does not already include a
`uniqueKey`. Therefore, duplicate URLs will be kept in the list. It does not protect the user from having duplicates in user set `uniqueKey`s however.
It is the user's responsibility to ensure uniqueness of their unique keys if they wish to keep more than just a single copy in the `RequestList`.

---
