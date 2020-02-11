---
id: puppeteerpooloptions
title: PuppeteerPoolOptions
---

<a name="PuppeteerPoolOptions"></a>

**Properties**

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[useLiveView]</code></td><td><code>boolean</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Enables the use of a preconfigured <a href="liveviewserver"><code>LiveViewServer</code></a> that serves snapshots
  just before a page would be recycled by <code>PuppeteerPool</code>. If there are no clients
  connected, it has close to zero impact on performance.</p>
</td></tr><tr>
<td><code>[maxOpenPagesPerInstance]</code></td><td><code>number</code></td><td><code>50</code></td>
</tr>
<tr>
<td colspan="3"><p>Maximum number of open pages (i.e. tabs) per browser. When this limit is reached, new pages are loaded in a new browser instance.</p>
</td></tr><tr>
<td><code>[retireInstanceAfterRequestCount]</code></td><td><code>number</code></td><td><code>100</code></td>
</tr>
<tr>
<td colspan="3"><p>Maximum number of requests that can be processed by a single browser instance.
  After the limit is reached, the browser is retired and new requests are
  handled by a new browser instance.</p>
</td></tr><tr>
<td><code>[puppeteerOperationTimeoutSecs]</code></td><td><code>number</code></td><td><code>15</code></td>
</tr>
<tr>
<td colspan="3"><p>All browser management operations such as launching a new browser, opening a new page
  or closing a page will timeout after the set number of seconds and the connected
  browser will be retired.</p>
</td></tr><tr>
<td><code>[instanceKillerIntervalSecs]</code></td><td><code>number</code></td><td><code>60</code></td>
</tr>
<tr>
<td colspan="3"><p>Indicates how often are the open Puppeteer instances checked whether they can be closed.</p>
</td></tr><tr>
<td><code>[killInstanceAfterSecs]</code></td><td><code>number</code></td><td><code>300</code></td>
</tr>
<tr>
<td colspan="3"><p>When Puppeteer instance reaches the <code>retireInstanceAfterRequestCount</code> limit then
  it is considered retired and no more tabs will be opened. After the last tab is closed the
  whole browser is closed too. This parameter defines a time limit between the last tab was opened and
  before the browser is closed even if there are pending open tabs.</p>
</td></tr><tr>
<td><code>[launchPuppeteerFunction]</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Overrides the default function to launch a new Puppeteer instance.
  The function must return a promise resolving to
  <a href="https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-browser"><code>Browser</code></a> instance.
  See the source code on
  <a href="https://github.com/apifytech/apify-js/blob/master/src/puppeteer_pool.js#L28" target="_blank">GitHub</a>
  for the default implementation.</p>
</td></tr><tr>
<td><code>[launchPuppeteerOptions]</code></td><td><code><a href="../typedefs/launchpuppeteeroptions">LaunchPuppeteerOptions</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Options used by <code>Apify.launchPuppeteer()</code> to start new Puppeteer instances.
  See <a href="../typedefs/launchpuppeteeroptions"><code>LaunchPuppeteerOptions</code></a>.</p>
</td></tr><tr>
<td><code>[recycleDiskCache]</code></td><td><code>boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>Enables recycling of disk cache directories by Chrome instances.
  When a browser instance is closed, its disk cache directory is not deleted but it&#39;s used by a newly opened browser instance.
  This is useful to reduce amount of data that needs to be downloaded to speed up crawling and reduce proxy usage.
  Note that the new browser starts with empty cookies, local storage etc. so this setting doesn&#39;t affect anonymity of your crawler.</p>
<p>  Beware that the disk cache directories can consume a lot of disk space.
  To limit the space consumed, you can pass the <code>--disk-cache-size=X</code> argument to <code>launchPuppeteerargs</code>,
  where <code>X</code> is the approximate maximum number of bytes for disk cache.</p>
<p>  Do not use the <code>recycleDiskCache</code> setting together with <code>--disk-cache-dir</code>
  argument in <code>launchPuppeteerargs</code>, the behavior is undefined.</p>
</td></tr><tr>
<td><code>[useIncognitoPages]</code></td><td><code>boolean</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>With this option selected, all pages will be opened in a new incognito browser context, which means
  that they will not share cookies or cache and their resources will not be throttled by one another.</p>
</td></tr><tr>
<td><code>[proxyUrls]</code></td><td><code>Array<string></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>An array of custom proxy URLs to be used by the <code>PuppeteerPool</code> instance.
  The provided custom proxies&#39; order will be randomized and the resulting list rotated.
  Custom proxies are not compatible with Apify Proxy and an attempt to use both
  configuration options will cause an error to be thrown on startup.</p>
</td></tr></tbody>
</table>
