---
id: datasetreducer
title: DatasetReducer
---

<a name="DatasetReducer"></a>

User-function used in the `Dataset.reduce()` API.

**Returns**: T

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>memo</code></td><td><code>T</code></td>
</tr>
<tr>
<td colspan="3"><p>Previous state of the reduction.</p>
</td></tr><tr>
<td><code>item</code></td><td><code>Object</code></td>
</tr>
<tr>
<td colspan="3"><p>Currect <a href="dataset"><code>Dataset</code></a> entry being processed.</p>
</td></tr><tr>
<td><code>index</code></td><td><code>Number</code></td>
</tr>
<tr>
<td colspan="3"><p>Position of current {Dataset} entry.</p>
</td></tr></tbody>
</table>
