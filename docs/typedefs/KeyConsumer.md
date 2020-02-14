---
id: keyconsumer
title: KeyConsumer
---

<a name="KeyConsumer"></a>

User-function used in the [`KeyValueStore.forEachKey()`](../api/keyvaluestore#forEachKey) method.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>key</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Current {KeyValue} key being processed.</p>
</td></tr><tr>
<td><code>index</code></td><td><code>Number</code></td>
</tr>
<tr>
<td colspan="3"><p>Position of the current key in {KeyValuestore}.</p>
</td></tr><tr>
<td><code>info</code></td><td><code>Object</code></td>
</tr>
<tr>
<td colspan="3"><p>Information about the current {KeyValueStore} entry.</p>
</td></tr><tr>
<td><code>info.size</code></td><td><code>Number</code></td>
</tr>
<tr>
<td colspan="3"><p>Size of the value associated with the current key in bytes.</p>
</td></tr></tbody>
</table>
