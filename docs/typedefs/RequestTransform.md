---
id: requesttransform
title: RequestTransform
---

<a name="RequestTransform"></a>

Takes an Apify {RequestOptions} object and changes it's attributes in a desired way. This user-function is used
[`Apify.utils.enqueueLinks`](../api/utils#utils.enqueueLinks) to modify requests before enqueuing them.

**Returns**: [`RequestOptions`](../typedefs/requestoptions) - The modified request options to enqueue.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>original</code></td><td><code><a href="../typedefs/requestoptions">RequestOptions</a></code></td>
</tr>
<tr>
<td colspan="3"><p>Request options to be modified.</p>
</td></tr></tbody>
</table>
