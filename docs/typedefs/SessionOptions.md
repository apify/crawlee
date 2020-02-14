---
id: sessionoptions
title: SessionOptions
---

<a name="SessionOptions"></a>

**Properties**

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[id]</code></td><td><code>string</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Id of session used for generating fingerprints. It is used as proxy session name.</p>
</td></tr><tr>
<td><code>[maxAgeSecs]</code></td><td><code>number</code></td><td><code>3000</code></td>
</tr>
<tr>
<td colspan="3"><p>Number of seconds after which the session is considered as expired.</p>
</td></tr><tr>
<td><code>userData</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Object where custom user data can be stored. For example custom headers.</p>
</td></tr><tr>
<td><code>[maxErrorScore]</code></td><td><code>number</code></td><td><code>3</code></td>
</tr>
<tr>
<td colspan="3"><p>Maximum number of marking session as blocked usage.
  If the <code>errorScore</code> reaches the <code>maxErrorScore</code> session is marked as block and it is thrown away.
  It starts at 0. Calling the <code>markBad</code> function increases the <code>errorScore</code> by 1.
  Calling the <code>markGood</code> will decrease the <code>errorScore</code> by <code>errorScoreDecrement</code></p>
</td></tr><tr>
<td><code>[errorScoreDecrement]</code></td><td><code>number</code></td><td><code>0.5</code></td>
</tr>
<tr>
<td colspan="3"><p>It is used for healing the session.
  For example: if your session is marked bad two times, but it is successful on the third attempt it&#39;s errorScore is decremented by this
  number.</p>
</td></tr><tr>
<td><code>[createdAt]</code></td><td><code>Date</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Date of creation.</p>
</td></tr><tr>
<td><code>[expiresAt]</code></td><td><code>Date</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Date of expiration.</p>
</td></tr><tr>
<td><code>[usageCount]</code></td><td><code>number</code></td><td><code>0</code></td>
</tr>
<tr>
<td colspan="3"><p>Indicates how many times the session has been used.</p>
</td></tr><tr>
<td><code>[errorCount]</code></td><td><code>number</code></td><td><code>0</code></td>
</tr>
<tr>
<td colspan="3"><p>Indicates how many times the session is marked bad.</p>
</td></tr><tr>
<td><code>[maxUsageCount]</code></td><td><code>number</code></td><td><code>50</code></td>
</tr>
<tr>
<td colspan="3"><p>Session should be used only a limited amount of times.
  This number indicates how many times the session is going to be used, before it is thrown away.</p>
</td></tr><tr>
<td><code>sessionPool</code></td><td><code><a href="sessionpool">SessionPool</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>SessionPool instance. Session will emit the <code>sessionRetired</code> event on this instance.</p>
</td></tr></tbody>
</table>
