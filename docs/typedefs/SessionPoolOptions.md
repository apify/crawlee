---
id: sessionpooloptions
title: SessionPoolOptions
---

<a name="SessionPoolOptions"></a>

**Properties**

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[maxPoolSize]</code></td><td><code>Number</code></td><td><code>1000</code></td>
</tr>
<tr>
<td colspan="3"><p>Maximum size of the pool.
Indicates how many sessions are rotated.</p>
</td></tr><tr>
<td><code>[sessionOptions]</code></td><td><code><a href="../typedefs/sessionoptions">SessionOptions</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>The configuration options for {Session} instances.</p>
</td></tr><tr>
<td><code>[persistStateKeyValueStoreId]</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Name or Id of <code>KeyValueStore</code> where is the <code>SessionPool</code> state stored.</p>
</td></tr><tr>
<td><code>[persistStateKey]</code></td><td><code>String</code></td><td><code>&quot;SESSION_POOL_STATE&quot;</code></td>
</tr>
<tr>
<td colspan="3"><p>Session pool persists it&#39;s state under this key in Key value store.</p>
</td></tr><tr>
<td><code>[createSessionFunction]</code></td><td><code><a href="../typedefs/createsession">CreateSession</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Custom function that should return <code>Session</code> instance.
Function receives <code>SessionPool</code> instance as a parameter</p>
</td></tr></tbody>
</table>
