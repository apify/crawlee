---
id: actorrun
title: ActorRun
---

<a name="ActorRun"></a>

Represents information about an actor run, as returned by the [`Apify.call()`](../api/apify#module_Apify.call) or
[`Apify.callTask()`](../api/apify#module_Apify.callTask) function. The object is almost equivalent to the JSON response of the
<a href="https://apify.com/docs/api/v2#/reference/actors/run-collection/run-actor" target="_blank">Actor run</a> Apify API endpoint and extended with
certain fields. For more details, see <a href="https://docs.apify.com/actor/run" target="_blank">Runs.</a>

**Properties**

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>id</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Actor run ID</p>
</td></tr><tr>
<td><code>actId</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Actor ID</p>
</td></tr><tr>
<td><code>startedAt</code></td><td><code>Date</code></td>
</tr>
<tr>
<td colspan="3"><p>Time when the actor run started</p>
</td></tr><tr>
<td><code>finishedAt</code></td><td><code>Date</code></td>
</tr>
<tr>
<td colspan="3"><p>Time when the actor run finished. Contains <code>null</code> for running actors.</p>
</td></tr><tr>
<td><code>status</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Status of the run. For possible values, see
  <a href="https://docs.apify.com/actor/run#lifecycle" target="_blank">Run lifecycle</a>
  in Apify actor documentation.</p>
</td></tr><tr>
<td><code>meta</code></td><td><code>Object</code></td>
</tr>
<tr>
<td colspan="3"><p>Actor run meta-data. For example:</p>
<pre><code>  {
    &quot;origin&quot;: &quot;API&quot;,
    &quot;clientIp&quot;: &quot;1.2.3.4&quot;,
    &quot;userAgent&quot;: &quot;ApifyClient/0.2.13 (Linux; Node/v8.11.3)&quot;
  }</code></pre></td></tr><tr>
<td><code>stats</code></td><td><code>Object</code></td>
</tr>
<tr>
<td colspan="3"><p>An object containing various actor run statistics. For example:</p>
<pre><code>  {
    &quot;inputBodyLen&quot;: 22,
    &quot;restartCount&quot;: 0,
    &quot;workersUsed&quot;: 1,
  }</code></pre><p>  Beware that object fields might change in future releases.</p>
</td></tr><tr>
<td><code>options</code></td><td><code>Object</code></td>
</tr>
<tr>
<td colspan="3"><p>Actor run options. For example:</p>
<pre><code>  {
    &quot;build&quot;: &quot;latest&quot;,
    &quot;waitSecs&quot;: 0,
    &quot;memoryMbytes&quot;: 256,
    &quot;diskMbytes&quot;: 512
  }</code></pre></td></tr><tr>
<td><code>buildId</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>ID of the actor build used for the run. For details, see
  <a href="https://docs.apify.com/actor/build" target="_blank">Builds</a>
  in Apify actor documentation.</p>
</td></tr><tr>
<td><code>buildNumber</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Number of the actor build used for the run. For example, <code>0.0.10</code>.</p>
</td></tr><tr>
<td><code>exitCode</code></td><td><code>Number</code></td>
</tr>
<tr>
<td colspan="3"><p>Exit code of the actor run process. It&#39;s <code>null</code> if actor is still running.</p>
</td></tr><tr>
<td><code>defaultKeyValueStoreId</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>ID of the default key-value store associated with the actor run. See <a href="../api/keyvaluestore"><code>KeyValueStore</code></a> for details.</p>
</td></tr><tr>
<td><code>defaultDatasetId</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>ID of the default dataset associated with the actor run. See <a href="../api/dataset"><code>Dataset</code></a> for details.</p>
</td></tr><tr>
<td><code>defaultRequestQueueId</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>ID of the default request queue associated with the actor run. See <a href="../api/requestqueue"><code>RequestQueue</code></a> for details.</p>
</td></tr><tr>
<td><code>containerUrl</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>URL on which the web server running inside actor run&#39;s Docker container can be accessed.
  For more details, see
  <a href="https://docs.apify.com/actor/run#container-web-server" target="_blank">Container web server</a>
  in Apify actor documentation.</p>
</td></tr><tr>
<td><code>output</code></td><td><code>Object</code></td>
</tr>
<tr>
<td colspan="3"><p>Contains output of the actor run. The value is <code>null</code> or <code>undefined</code> in case the actor is still running,
  or if you pass <code>false</code> to the <code>fetchOutput</code> option of <a href="../api/apify#module_Apify.call"><code>Apify.call()</code></a>.</p>
<p>  For example:</p>
<pre><code>  {
    &quot;contentType&quot;: &quot;application/json; charset=utf-8&quot;,
    &quot;body&quot;: {
      &quot;message&quot;: &quot;Hello world!&quot;
    }
  }</code></pre></td></tr></tbody>
</table>
