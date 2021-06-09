---
id: version-1.0.0-dataset
title: Dataset
original_id: dataset
---

<a name="dataset"></a>

The `Dataset` class represents a store for structured data where each object stored has the same attributes, such as online store products or real
estate offers. You can imagine it as a table, where each object is a row and its attributes are columns. Dataset is an append-only storage - you can
only add new records to it but you cannot modify or remove existing records. Typically it is used to store crawling results.

Do not instantiate this class directly, use the [`Apify.openDataset()`](../api/apify#opendataset) function instead.

`Dataset` stores its data either on local disk or in the Apify cloud, depending on whether the `APIFY_LOCAL_STORAGE_DIR` or `APIFY_TOKEN` environment
variables are set.

If the `APIFY_LOCAL_STORAGE_DIR` environment variable is set, the data is stored in the local directory in the following files:

```
{APIFY_LOCAL_STORAGE_DIR}/datasets/{DATASET_ID}/{INDEX}.json
```

Note that `{DATASET_ID}` is the name or ID of the dataset. The default dataset has ID: `default`, unless you override it by setting the
`APIFY_DEFAULT_DATASET_ID` environment variable. Each dataset item is stored as a separate JSON file, where `{INDEX}` is a zero-based index of the
item in the dataset.

If the `APIFY_TOKEN` environment variable is set but `APIFY_LOCAL_STORAGE_DIR` not, the data is stored in the
[Apify Dataset](https://docs.apify.com/storage/dataset) cloud storage. Note that you can force usage of the cloud storage also by passing the
`forceCloud` option to [`Apify.openDataset()`](../api/apify#opendataset) function, even if the `APIFY_LOCAL_STORAGE_DIR` variable is set.

**Example usage:**

```javascript
// Write a single row to the default dataset
await Apify.pushData({ col1: 123, col2: 'val2' });

// Open a named dataset
const dataset = await Apify.openDataset('some-name');

// Write a single row
await dataset.pushData({ foo: 'bar' });

// Write multiple rows
await dataset.pushData([{ foo: 'bar2', col2: 'val2' }, { col3: 123 }]);
```

---

<a name="pushdata"></a>

## `dataset.pushData(data)`

Stores an object or an array of objects to the dataset. The function returns a promise that resolves when the operation finishes. It has no result,
but throws on invalid args or other errors.

**IMPORTANT**: Make sure to use the `await` keyword when calling `pushData()`, otherwise the actor process might finish before the data is stored!

The size of the data is limited by the receiving API and therefore `pushData()` will only allow objects whose JSON representation is smaller than 9MB.
When an array is passed, none of the included objects may be larger than 9MB, but the array itself may be of any size.

The function internally chunks the array into separate items and pushes them sequentially. The chunking process is stable (keeps order of data), but
it does not provide a transaction safety mechanism. Therefore, in the event of an uploading error (after several automatic retries), the function's
Promise will reject and the dataset will be left in a state where some of the items have already been saved to the dataset while other items from the
source array were not. To overcome this limitation, the developer may, for example, read the last item saved in the dataset and re-attempt the save of
the data from this item onwards to prevent duplicates.

**Parameters**:

-   **`data`**: `object` | `Array<object>` - Object or array of objects containing data to be stored in the default dataset. The objects must be
    serializable to JSON and the JSON representation of each object must be smaller than 9MB.

**Returns**:

`Promise<void>`

---

<a name="getdata"></a>

## `dataset.getData([options])`

Returns [`DatasetContent`](../typedefs/dataset-content) object holding the items in the dataset based on the provided parameters.

If you need to get data in an unparsed format, use the [`Apify.newClient()`](../api/apify#newclient) function to get a new `apify-client` instance and
call [`datasetClient.downloadItems()`](https://github.com/apify/apify-client-js#DatasetClient+downloadItems)

**Parameters**:

-   **`[options]`**: `Object` - All `getData()` parameters are passed via an options object with the following keys:
    -   **`[offset]`**: `number` <code> = 0</code> - Number of array elements that should be skipped at the start.
    -   **`[limit]`**: `number` <code> = 250000</code> - Maximum number of array elements to return.
    -   **`[desc]`**: `boolean` <code> = false</code> - If `true` then the objects are sorted by `createdAt` in descending order. Otherwise they are
        sorted in ascending order.
    -   **`[fields]`**: `Array<string>` - An array of field names that will be included in the result. If omitted, all fields are included in the
        results.
    -   **`[unwind]`**: `string` - Specifies a name of the field in the result objects that will be used to unwind the resulting objects. By default,
        the results are returned as they are.
    -   **`[clean]`**: `boolean` <code> = false</code> - If `true` then the function returns only non-empty items and skips hidden fields (i.e. fields
        starting with `#` character). Note that the `clean` parameter is a shortcut for `skipHidden: true` and `skipEmpty: true` options.
    -   **`[skipHidden]`**: `boolean` <code> = false</code> - If `true` then the function doesn't return hidden fields (fields starting with "#"
        character).
    -   **`[skipEmpty]`**: `boolean` <code> = false</code> - If `true` then the function doesn't return empty items. Note that in this case the
        returned number of items might be lower than limit parameter and pagination must be done using the `limit` value.

**Returns**:

[`Promise<DatasetContent>`](../typedefs/dataset-content)

---

<a name="getinfo"></a>

## `dataset.getInfo()`

Returns an object containing general information about the dataset.

The function returns the same object as the Apify API Client's
[getDataset](https://docs.apify.com/api/apify-client-js/latest#ApifyClient-datasets-getDataset) function, which in turn calls the
[Get dataset](https://apify.com/docs/api/v2#/reference/datasets/dataset/get-dataset) API endpoint.

**Example:**

```
{
  id: "WkzbQMuFYuamGv3YF",
  name: "my-dataset",
  userId: "wRsJZtadYvn4mBZmm",
  createdAt: new Date("2015-12-12T07:34:14.202Z"),
  modifiedAt: new Date("2015-12-13T08:36:13.202Z"),
  accessedAt: new Date("2015-12-14T08:36:13.202Z"),
  itemCount: 14,
  cleanItemCount: 10
}
```

**Returns**:

`Promise<object>`

---

<a name="foreach"></a>

## `dataset.forEach(iteratee, [options], [index])`

Iterates over dataset items, yielding each in turn to an `iteratee` function. Each invocation of `iteratee` is called with two arguments:
`(item, index)`.

If the `iteratee` function returns a Promise then it is awaited before the next call. If it throws an error, the iteration is aborted and the
`forEach` function throws the error.

**Example usage**

```javascript
const dataset = await Apify.openDataset('my-results');
await dataset.forEach(async (item, index) => {
    console.log(`Item at ${index}: ${JSON.stringify(item)}`);
});
```

**Parameters**:

-   **`iteratee`**: [`DatasetConsumer`](../typedefs/dataset-consumer) - A function that is called for every item in the dataset.
-   **`[options]`**: `Object` - All `forEach()` parameters are passed via an options object with the following keys:
    -   **`[desc]`**: `boolean` <code> = false</code> - If `true` then the objects are sorted by `createdAt` in descending order.
    -   **`[fields]`**: `Array<string>` - If provided then returned objects will only contain specified keys.
    -   **`[unwind]`**: `string` - If provided then objects will be unwound based on provided field.
-   **`[index]`**: `number` <code> = 0</code> - Specifies the initial index number passed to the `iteratee` function.

**Returns**:

`Promise<void>`

---

<a name="map"></a>

## `dataset.map(iteratee, [options])`

Produces a new array of values by mapping each value in list through a transformation function `iteratee()`. Each invocation of `iteratee()` is called
with two arguments: `(element, index)`.

If `iteratee` returns a `Promise` then it's awaited before a next call.

**Parameters**:

-   **`iteratee`**: [`DatasetMapper`](../typedefs/dataset-mapper)
-   **`[options]`**: `Object` - All `map()` parameters are passed via an options object with the following keys:
    -   **`[desc]`**: `boolean` <code> = false</code> - If `true` then the objects are sorted by createdAt in descending order.
    -   **`[fields]`**: `Array<string>` - If provided then returned objects will only contain specified keys
    -   **`[unwind]`**: `string` - If provided then objects will be unwound based on provided field.

**Returns**:

`Promise<Array<object>>`

---

<a name="reduce"></a>

## `dataset.reduce(iteratee, memo, [options])`

Reduces a list of values down to a single value.

Memo is the initial state of the reduction, and each successive step of it should be returned by `iteratee()`. The `iteratee()` is passed three
arguments: the `memo`, then the `value` and `index` of the iteration.

If no `memo` is passed to the initial invocation of reduce, the `iteratee()` is not invoked on the first element of the list. The first element is
instead passed as the memo in the invocation of the `iteratee()` on the next element in the list.

If `iteratee()` returns a `Promise` then it's awaited before a next call.

**Parameters**:

-   **`iteratee`**: [`DatasetReducer`](../typedefs/dataset-reducer)
-   **`memo`**: `object` - Initial state of the reduction.
-   **`[options]`**: `Object` - All `reduce()` parameters are passed via an options object with the following keys:
    -   **`[desc]`**: `boolean` <code> = false</code> - If `true` then the objects are sorted by createdAt in descending order.
    -   **`[fields]`**: `Array<string>` - If provided then returned objects will only contain specified keys
    -   **`[unwind]`**: `string` - If provided then objects will be unwound based on provided field.

**Returns**:

`Promise<object>`

---

<a name="drop"></a>

## `dataset.drop()`

Removes the dataset either from the Apify cloud storage or from the local directory, depending on the mode of operation.

**Returns**:

`Promise<void>`

---
