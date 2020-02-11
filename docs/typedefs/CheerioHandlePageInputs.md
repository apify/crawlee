---
id: cheeriohandlepageinputs
title: CheerioHandlePageInputs
---

<a name="CheerioHandlePageInputs"></a>

**Properties**

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[$]</code></td><td><code>Cheerio</code></td>
</tr>
<tr>
<td colspan="3"><p>The <a href="https://cheerio.js.org/">Cheerio</a> object with parsed HTML.</p>
</td></tr><tr>
<td><code>body</code></td><td><code>String</code> | <code>Buffer</code></td>
</tr>
<tr>
<td colspan="3"><p>The request body of the web page.</p>
</td></tr><tr>
<td><code>[json]</code></td><td><code>Object</code></td>
</tr>
<tr>
<td colspan="3"><p>The parsed object from JSON string if the response contains the content type application/json.</p>
</td></tr><tr>
<td><code>request</code></td><td><code><a href="request">Request</a></code></td>
</tr>
<tr>
<td colspan="3"><p>The original {Request} object.</p>
</td></tr><tr>
<td><code>contentType</code></td><td><code>Object</code></td>
</tr>
<tr>
<td colspan="3"><p>Parsed <code>Content-Type header: { type, encoding }</code>.</p>
</td></tr><tr>
<td><code>response</code></td><td><code>IncomingMessage</code></td>
</tr>
<tr>
<td colspan="3"><p>An instance of Node&#39;s http.IncomingMessage object,</p>
</td></tr><tr>
<td><code>autoscaledPool</code></td><td><code><a href="autoscaledpool">AutoscaledPool</a></code></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>[session]</code></td><td><code>session</code></td>
</tr>
<tr>
<td colspan="3"></td></tr></tbody>
</table>
