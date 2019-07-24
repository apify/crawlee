---
id: queueoperationinfo
title: QueueOperationInfo
---

<a name="QueueOperationInfo"></a>

A helper class that is used to report results from various [`RequestQueue`](../api/requestqueue) functions as well as
[`Apify.utils.enqueueLinks()`](../api/utils#utils.enqueueLinks).

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
</td></tr><tr>
<td><code>request</code></td><td><code><a href="request">Request</a></code> | <code>Object</code></td>
</tr>
<tr>
<td colspan="3"><p>The original <code>Request</code> object passed to the <code>RequestQueue</code> function.</p>
</td></tr></tbody>
</table>
