---
id: liveviewserver
title: LiveViewServer
---
<a name="LiveViewServer"></a>

`LiveViewServer` enables serving of browser snapshots via web sockets. It includes its own client
that provides a simple frontend to viewing the captured snapshots. A snapshot consists of three
pieces of information, the currently opened URL, the content of the page (HTML) and its screenshot.

```json
{
    "pageUrl": "https://www.example.com",
    "htmlContent": "<html><body> ....",
    "screenshotIndex": 3,
    "createdAt": "2019-04-18T11:50:40.060Z"
}
```

`LiveViewServer` is useful when you want to be able to inspect the current browser status on demand.
When no client is connected, the webserver consumes very low resources so it should have a close
to zero impact on performance. Only once a client connects the server will start serving snapshots.
Once no longer needed, it can be disabled again in the client to remove any performance impact.

NOTE: Screenshot taking in browser typically takes around 300ms. So having the `LiveViewServer`
always serve snapshots will have a significant impact on performance.

When using [`PuppeteerPool`](puppeteerpool), the `LiveViewServer` can be
easily used just by providing the `useLiveView = true` option to the [`PuppeteerPool`](puppeteerpool).
It can also be initiated via [`PuppeteerCrawler`](puppeteercrawler) `puppeteerPoolOptions`.

It will take snapshots of the first page of the latest browser. Taking snapshots of only a
single page improves performance and stability dramatically in high concurrency situations.

When running locally, it is often best to use a headful browser for debugging, since it provides
a better view into the browser, including DevTools, but `LiveViewServer` works too.


* [LiveViewServer](liveviewserver)
    * [`new LiveViewServer([options])`](#new_LiveViewServer_new)
    * [`.start()`](#LiveViewServer+start) ⇒ `Promise`
    * [`.stop()`](#LiveViewServer+stop) ⇒ `Promise`
    * [`.serve(page)`](#LiveViewServer+serve) ⇒ `Promise`
    * [`.getLastSnapshot()`](#LiveViewServer+getLastSnapshot) ⇒ `Object`
    * [`.isRunning()`](#LiveViewServer+isRunning) ⇒ `boolean`
    * [`.hasClients()`](#LiveViewServer+hasClients) ⇒ `boolean`

<a name="new_LiveViewServer_new"></a>

## `new LiveViewServer([options])`
<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[options]</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>All <code>LiveViewServer</code> parameters are passed
  via an options object with the following keys:</p>
</td></tr><tr>
<td><code>[options.screenshotDirectoryPath]</code></td><td><code>string</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>By default, the screenshots are saved to
  the <code>live_view</code> directory in the Apify local storage directory.
  Provide a different absolute path to change the settings.</p>
</td></tr><tr>
<td><code>[options.maxScreenshotFiles]</code></td><td><code>number</code></td><td><code>10</code></td>
</tr>
<tr>
<td colspan="3"><p>Limits the number of screenshots stored
  by the server. This is to prevent using up too much disk space.</p>
</td></tr><tr>
<td><code>[options.snapshotTimeoutSecs]</code></td><td><code>number</code></td><td><code>3</code></td>
</tr>
<tr>
<td colspan="3"><p>If a snapshot is not made within the timeout,
  its creation will be aborted. This is to prevent
  pages from being hung up by a stalled screenshot.</p>
</td></tr><tr>
<td><code>[options.maxSnapshotFrequencySecs]</code></td><td><code>number</code></td><td><code>2</code></td>
</tr>
<tr>
<td colspan="3"><p>Use this parameter to further decrease the resource consumption
  of <code>LiveViewServer</code> by limiting the frequency at which it&#39;ll
  serve snapshots.</p>
</td></tr></tbody>
</table>
<a name="LiveViewServer+start"></a>

## `liveViewServer.start()` ⇒ `Promise`
Starts the HTTP server with web socket connections enabled.
Snapshots will not be created until a client has connected.

<a name="LiveViewServer+stop"></a>

## `liveViewServer.stop()` ⇒ `Promise`
Prevents the server from receiving more connections. Existing connections
will not be terminated, but the server will not prevent a process exit.

<a name="LiveViewServer+serve"></a>

## `liveViewServer.serve(page)` ⇒ `Promise`
Serves a snapshot to all connected clients.
Screenshots are not served directly, only their index number
which is used by client to retrieve the screenshot.

Will time out and throw in `options.snapshotTimeoutSecs`.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>page</code></td><td><code>Page</code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="LiveViewServer+getLastSnapshot"></a>

## `liveViewServer.getLastSnapshot()` ⇒ `Object`
<a name="LiveViewServer+isRunning"></a>

## `liveViewServer.isRunning()` ⇒ `boolean`
<a name="LiveViewServer+hasClients"></a>

## `liveViewServer.hasClients()` ⇒ `boolean`
