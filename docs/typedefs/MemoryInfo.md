---
id: memoryinfo
title: MemoryInfo
---

<a name="MemoryInfo"></a>

Describes memory usage of an Actor.

**Properties**

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>totalBytes</code></td><td><code>Number</code></td>
</tr>
<tr>
<td colspan="3"><p>Total memory available in the system or container</p>
</td></tr><tr>
<td><code>freeBytes</code></td><td><code>Number</code></td>
</tr>
<tr>
<td colspan="3"><p>Amount of free memory in the system or container</p>
</td></tr><tr>
<td><code>usedBytes</code></td><td><code>Number</code></td>
</tr>
<tr>
<td colspan="3"><p>Amount of memory used (= totalBytes - freeBytes)</p>
</td></tr><tr>
<td><code>mainProcessBytes</code></td><td><code>Number</code></td>
</tr>
<tr>
<td colspan="3"><p>Amount of memory used the current Node.js process</p>
</td></tr><tr>
<td><code>childProcessesBytes</code></td><td><code>Number</code></td>
</tr>
<tr>
<td colspan="3"><p>Amount of memory used by child processes of the current Node.js process</p>
</td></tr></tbody>
</table>
