---
id: launchpuppeteeroptions
title: LaunchPuppeteerOptions
---

<a name="LaunchPuppeteerOptions"></a>

Apify extends the launch options of Puppeteer. You can use any of the
<a href="https://pptr.dev/#?product=Puppeteer&show=api-puppeteerlaunchoptions" target="_blank"><code>puppeteer.launch()</code></a> options in the
[`Apify.launchPuppeteer()`](../api/apify#module_Apify.launchPuppeteer) function and in addition, all the options available below.

**Properties**

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[proxyUrl]</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>URL to a HTTP proxy server. It must define the port number,
  and it may also contain proxy username and password.</p>
<p>  Example: <code>http://bob:pass123@proxy.example.com:1234</code>.</p>
</td></tr><tr>
<td><code>[userAgent]</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>The <code>User-Agent</code> HTTP header used by the browser.
  If not provided, the function sets <code>User-Agent</code> to a reasonable default
  to reduce the chance of detection of the crawler.</p>
</td></tr><tr>
<td><code>[useChrome]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If <code>true</code> and <code>executablePath</code> is not set,
  Puppeteer will launch full Google Chrome browser available on the machine
  rather than the bundled Chromium. The path to Chrome executable
  is taken from the <code>APIFY_CHROME_EXECUTABLE_PATH</code> environment variable if provided,
  or defaults to the typical Google Chrome executable location specific for the operating system.
  By default, this option is <code>false</code>.</p>
</td></tr><tr>
<td><code>[useApifyProxy]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If set to <code>true</code>, Puppeteer will be configured to use
  <a href="https://my.apify.com/proxy" target="_blank">Apify Proxy</a> for all connections.
  For more information, see the <a href="https://docs.apify.com/proxy" target="_blank">documentation</a></p>
</td></tr><tr>
<td><code>[apifyProxyGroups]</code></td><td><code>Array<String></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>An array of proxy groups to be used
  by the <a href="https://docs.apify.com/proxy" target="_blank">Apify Proxy</a>.
  Only applied if the <code>useApifyProxy</code> option is <code>true</code>.</p>
</td></tr><tr>
<td><code>[apifyProxySession]</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Apify Proxy session identifier to be used by all the Chrome browsers.
  All HTTP requests going through the proxy with the same session identifier
  will use the same target proxy server (i.e. the same IP address).
  The identifier can only contain the following characters: <code>0-9</code>, <code>a-z</code>, <code>A-Z</code>, <code>&quot;.&quot;</code>, <code>&quot;_&quot;</code> and <code>&quot;~&quot;</code>.
  Only applied if the <code>useApifyProxy</code> option is <code>true</code>.</p>
</td></tr><tr>
<td><code>[puppeteerModule]</code></td><td><code>string</code> | <code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Either a require path (<code>string</code>) to a package to be used instead of default <code>puppeteer</code>,
  or an already required module (<code>Object</code>). This enables usage of various Puppeteer
  wrappers such as <code>puppeteer-extra</code>.</p>
<p>  Take caution, because it can cause all kinds of unexpected errors and weird behavior.
  Apify SDK is not tested with any other library besides <code>puppeteer</code> itself.</p>
</td></tr><tr>
<td><code>[stealth]</code></td><td><code>boolean</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>This setting hides most of the known properties that identify headless Chrome and makes it nearly undetectable.
  It is recommended to use it together with the <code>useChrome</code> set to <code>true</code>.</p>
</td></tr><tr>
<td><code>[stealthOptions]</code></td><td><code><a href="../typedefs/stealthoptions">StealthOptions</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Using this configuration, you can disable some of the hiding tricks.
  For these settings to take effect <code>stealth</code> must be set to true</p>
</td></tr></tbody>
</table>
