---
id: requestliststate
title: RequestListState
---

<a name="RequestListState"></a>

Represents state of a {RequestList}. It can be used to resume a {RequestList} which has been previously processed. You can obtain the state by calling
[`RequestList.getState()`](<../api/requestlist#getState()>) and receive an object with the following structure:

```
{
    nextIndex: 5,
    nextUniqueKey: 'unique-key-5'
    inProgress: {
        'unique-key-1': true,
        'unique-key-4': true
    },
}
```

**Properties**

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>nextIndex</code></td><td><code>Number</code></td>
</tr>
<tr>
<td colspan="3"><p>Position of the next request to be processed.</p>
</td></tr><tr>
<td><code>nextUniqueKey</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Key of the next request to be processed.</p>
</td></tr><tr>
<td><code>inProgress</code></td><td><code>Object<String, Boolean></code></td>
</tr>
<tr>
<td colspan="3"><p>An object mapping request keys to a boolean value respresenting whether they are being processed at the moment.</p>
</td></tr></tbody>
</table>
