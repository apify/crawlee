---
id: queueoperationinfo
title: QueueOperationInfo
---
<a name="QueueOperationInfo"></a>

A helper class that is used to report results from the
[`Apify.utils.puppeteer.enqueueLinks()`](../api/puppeteer#puppeteer.enqueueLinks) function.

**Properties**
<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>wasAlreadyPresent</code></td><td><code>Boolean</code></td>
</tr>
<tr>
<td colspan="3"><p>Indicates if request was already present in the queue.</p>
</td></tr><tr>
<td><code>wasAlreadyHandled</code></td><td><code>Boolean</code></td>
</tr>
<tr>
<td colspan="3"><p>Indicates if request was already marked as handled.</p>
</td></tr><tr>
<td><code>requestId</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>The ID of the added request</p>
</td></tr></tbody>
</table>
