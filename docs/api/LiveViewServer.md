---
id: live-view-server
title: LiveViewServer
---

<a name="liveviewserver"></a>

`LiveViewServer` enables serving of browser snapshots via web sockets. It includes its own client that provides a simple frontend to viewing the
captured snapshots. A snapshot consists of three pieces of information, the currently opened URL, the content of the page (HTML) and its screenshot.

```json
{
    "pageUrl": "https://www.example.com",
    "htmlContent": "<html><body> ....",
    "screenshotIndex": 3,
    "createdAt": "2019-04-18T11:50:40.060Z"
}
```

`LiveViewServer` is useful when you want to be able to inspect the current browser status on demand. When no client is connected, the webserver
consumes very low resources so it should have a close to zero impact on performance. Only once a client connects the server will start serving
snapshots. Once no longer needed, it can be disabled again in the client to remove any performance impact.

NOTE: Screenshot taking in browser typically takes around 300ms. So having the `LiveViewServer` always serve snapshots will have a significant impact
on performance.

When using [`PuppeteerPool`](/docs/api/puppeteer-pool), the `LiveViewServer` can be easily used just by providing the `useLiveView = true` option to
the [`PuppeteerPool`](/docs/api/puppeteer-pool). It can also be initiated via [`PuppeteerCrawler`](/docs/api/puppeteer-crawler)
`puppeteerPoolOptions`.

It will take snapshots of the first page of the latest browser. Taking snapshots of only a single page improves performance and stability dramatically
in high concurrency situations.

When running locally, it is often best to use a headful browser for debugging, since it provides a better view into the browser, including DevTools,
but `LiveViewServer` works too.

---

<a name="liveviewserver"></a>

## `new LiveViewServer([options])`

**Params**

-   **`[options]`**: `Object` - All `LiveViewServer` parameters are passed via an options object with the following keys:
    -   **`[.screenshotDirectoryPath]`**: `string` - By default, the screenshots are saved to the `live_view` directory in the Apify local storage
        directory. Provide a different absolute path to change the settings.
    -   **`[.maxScreenshotFiles]`**: `number` <code> = 10</code> - Limits the number of screenshots stored by the server. This is to prevent using up
        too much disk space.
    -   **`[.snapshotTimeoutSecs]`**: `number` <code> = 3</code> - If a snapshot is not made within the timeout, its creation will be aborted. This is
        to prevent pages from being hung up by a stalled screenshot.
    -   **`[.maxSnapshotFrequencySecs]`**: `number` <code> = 2</code> - Use this parameter to further decrease the resource consumption of
        `LiveViewServer` by limiting the frequency at which it'll serve snapshots.

---

<a name="start"></a>

## `liveViewServer.start()`

**Returns**: `Promise<void>`

Starts the HTTP server with web socket connections enabled. Snapshots will not be created until a client has connected.

---

<a name="stop"></a>

## `liveViewServer.stop()`

**Returns**: `Promise<void>`

Prevents the server from receiving more connections. Existing connections will not be terminated, but the server will not prevent a process exit.

---

<a name="serve"></a>

## `liveViewServer.serve(page)`

**Returns**: `Promise<void>`

Serves a snapshot to all connected clients. Screenshots are not served directly, only their index number which is used by client to retrieve the
screenshot.

Will time out and throw in `options.snapshotTimeoutSecs`.

**Params**

-   **`page`**: `Page`

---

<a name="isrunning"></a>

## `liveViewServer.isRunning()`

**Returns**: `boolean`

---

<a name="hasclients"></a>

## `liveViewServer.hasClients()`

**Returns**: `boolean`

---
