---
id: request-list-state
title: RequestListState
---

<a name="requestliststate"></a>

Represents state of a {RequestList}. It can be used to resume a {RequestList} which has been previously processed. You can obtain the state by calling
[`RequestList.getState()`](/docs/api/request-list#getstate) and receive an object with the following structure:

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

## Properties

### `nextIndex`

**Type**: `Number`

Position of the next request to be processed.

---

### `nextUniqueKey`

**Type**: `String`

Key of the next request to be processed.

---

### `inProgress`

**Type**: `Object<String, Boolean>`

An object mapping request keys to a boolean value respresenting whether they are being processed at the moment.

---
