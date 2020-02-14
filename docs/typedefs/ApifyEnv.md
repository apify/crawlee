---
id: apifyenv
title: ApifyEnv
---

<a name="ApifyEnv"></a>

Parsed representation of the `APIFY_XXX` environmental variables.

**Properties**

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>actorId</code></td><td><code>String</code> | <code>null</code></td>
</tr>
<tr>
<td colspan="3"><p>ID of the actor (APIFY_ACTOR_ID)</p>
</td></tr><tr>
<td><code>actorRunId</code></td><td><code>String</code> | <code>null</code></td>
</tr>
<tr>
<td colspan="3"><p>ID of the actor run (APIFY_ACTOR_RUN_ID)</p>
</td></tr><tr>
<td><code>actorTaskId</code></td><td><code>String</code> | <code>null</code></td>
</tr>
<tr>
<td colspan="3"><p>ID of the actor task (APIFY_ACTOR_TASK_ID)</p>
</td></tr><tr>
<td><code>userId</code></td><td><code>String</code> | <code>null</code></td>
</tr>
<tr>
<td colspan="3"><p>ID of the user who started the actor - note that it might be
  different than the owner ofthe actor (APIFY_USER_ID)</p>
</td></tr><tr>
<td><code>token</code></td><td><code>String</code> | <code>null</code></td>
</tr>
<tr>
<td colspan="3"><p>Authentication token representing privileges given to the actor run,
  it can be passed to various Apify APIs (APIFY_TOKEN)</p>
</td></tr><tr>
<td><code>startedAt</code></td><td><code>Date</code> | <code>null</code></td>
</tr>
<tr>
<td colspan="3"><p>Date when the actor was started (APIFY_STARTED_AT)</p>
</td></tr><tr>
<td><code>timeoutAt</code></td><td><code>Date</code> | <code>null</code></td>
</tr>
<tr>
<td colspan="3"><p>Date when the actor will time out (APIFY_TIMEOUT_AT)</p>
</td></tr><tr>
<td><code>defaultKeyValueStoreId</code></td><td><code>String</code> | <code>null</code></td>
</tr>
<tr>
<td colspan="3"><p>ID of the key-value store where input and output data of this
  actor is stored (APIFY_DEFAULT_KEY_VALUE_STORE_ID)</p>
</td></tr><tr>
<td><code>defaultDatasetId</code></td><td><code>String</code> | <code>null</code></td>
</tr>
<tr>
<td colspan="3"><p>ID of the dataset where input and output data of this
  actor is stored (APIFY_DEFAULT_DATASET_ID)</p>
</td></tr><tr>
<td><code>memoryMbytes</code></td><td><code>Number</code> | <code>null</code></td>
</tr>
<tr>
<td colspan="3"><p>Amount of memory allocated for the actor,
  in megabytes (APIFY_MEMORY_MBYTES)</p>
</td></tr></tbody>
</table>
