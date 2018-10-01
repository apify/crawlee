---
id: dataset
title: Dataset
---
<a name="Dataset"></a>

## Dataset
The `Dataset` class represents a store for structured data where each object stored has the same attributes,
such as online store products or real estate offers. You can imagine it as a table,
where each object is a row and its attributes are columns.
Dataset is an append-only storage - you can only add new records to it but you cannot modify or remove existing records.
Typically it is used to store crawling results.

Do not instantiate this class directly, use the
[`Apify.openDataset()`](Apify#openDataset) function instead.

`Dataset` stores its data either on local disk or in the Apify cloud,
depending on whether the `APIFY_LOCAL_STORAGE_DIR` or `APIFY_TOKEN` environment variable is set.

If the `APIFY_LOCAL_STORAGE_DIR` environment variable is set, the data is stored in
the local directory in the following files:
```
[APIFY_LOCAL_STORAGE_DIR]/datasets/[DATASET_ID]/[INDEX].json
```
Note that `[DATASET_ID]` is the name or ID of the dataset. The default dataset has ID `default`,
unless you override it by setting the `APIFY_DEFAULT_DATASET_ID` environment variable.
Each dataset item is stored as a separate JSON file, where `[INDEX]` is a zero-based index of the item in the dataset.

If the `APIFY_TOKEN` environment variable is provided instead, the data is stored
in the [Apify Dataset](https://www.apify.com/docs/storage#dataset) cloud storage.

**Example usage:**

```javascript
// Write a single row to the default dataset
await Apify.pushData({ col1: 123, col2: 'val2' });

// Open a named dataset
const dataset = await Apify.openDataset('some-name');

// Write a single row
await dataset.pushData({ foo: 'bar' });

// Write multiple rows
await dataset.pushData([
  { foo: 'bar2', col2: 'val2' },
  { col3: 123 },
]);
```

**Kind**: global class  

* [Dataset](#Dataset)
    * [.pushData(data)](#Dataset+pushData) ⇒ <code>Promise</code>
    * [.getData(options)](#Dataset+getData) ⇒ <code>Promise</code>
    * [.getInfo(opts)](#Dataset+getInfo) ⇒ <code>Promise</code>
    * [.forEach(iteratee, opts, index)](#Dataset+forEach) ⇒ <code>Promise.&lt;undefined&gt;</code>
    * [.map(iteratee, opts, index)](#Dataset+map) ⇒ <code>Promise.&lt;Array&gt;</code>
    * [.reduce(iteratee, memo, opts, index)](#Dataset+reduce) ⇒ <code>Promise.&lt;\*&gt;</code>
    * [.delete()](#Dataset+delete) ⇒ <code>Promise</code>

<a name="Dataset+pushData"></a>

### dataset.pushData(data) ⇒ <code>Promise</code>
Stores an object or an array of objects to the dataset.
The function returns a promise that resolves when the operation finishes.
It has no result, but throws on invalid args or other errors.

**IMPORTANT**: Make sure to use the `await` keyword when calling `pushData()`,
otherwise the actor process might finish before the data is stored!

The size of the data is limited by the receiving API and therefore `pushData` will only
allow objects whose JSON representation is smaller than 9MB. When an array is passed,
none of the included objects
may be larger than 9MB, but the array itself may be of any size.

The function internally
chunks the array into separate items and pushes them sequentially.
The chunking process is stable (keeps order of data), but it does not provide a transaction
safety mechanism. Therefore, in the event of an uploading error (after several automatic retries),
the function's promise will reject and the dataset will be left in a state where some of
the items have already been saved to the dataset while other items from the source array were not.
To overcome this limitation, the developer may, for example, read the last item saved in the dataset
and re-attempt the save of the data from this item onwards to prevent duplicates.

**Kind**: instance method of [<code>Dataset</code>](#Dataset)  
**Returns**: <code>Promise</code> - Returns a promise that resolves once the data is saved.  

| Param | Type | Description |
| --- | --- | --- |
| data | <code>Object</code> \| <code>Array</code> | Object or array of objects containing data to be stored in the default dataset. The objects must be serializable to JSON and the JSON representation of each object must be smaller than 9MB. |

<a name="Dataset+getData"></a>

### dataset.getData(options) ⇒ <code>Promise</code>
Returns items in the dataset based on the provided parameters.

If format is `json` then the function doesn't return an array of records but {@linkcode PaginationList} instead.

**Kind**: instance method of [<code>Dataset</code>](#Dataset)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| options | <code>Object</code> |  |  |
| [options.format] | <code>String</code> | <code>&#x27;json&#x27;</code> | Format of the items, possible values are: `json`, `csv`, `xlsx`, `html`, `xml` and `rss`. |
| [options.offset] | <code>Number</code> | <code>0</code> | Number of array elements that should be skipped at the start. |
| [options.limit] | <code>Number</code> | <code>250000</code> | Maximum number of array elements to return. |
| [options.desc] | <code>Boolean</code> |  | If `true` then the objects are sorted by `createdAt` in descending order.   Otherwise they are sorted in ascending order. |
| [options.fields] | <code>Array</code> |  | An array of field names that will be included in the result. If omitted, all fields are included in the results. |
| [options.unwind] | <code>String</code> |  | Specifies a name of the field in the result objects that will be used to unwind the resulting objects.   By default, the results are returned as they are. |
| [options.disableBodyParser] | <code>Boolean</code> |  | If `true` then response from API will not be parsed. |
| [options.attachment] | <code>Number</code> |  | If `true` then the response will define the `Content-Disposition: attachment` HTTP header, forcing a web   browser to download the file rather than to display it. By default, this header is not present. |
| [options.delimiter] | <code>String</code> | <code>&#x27;,&#x27;</code> | A delimiter character for CSV files, only used if `format` is `csv`.   You might need to URL-encode the character (e.g. use `%09` for tab or `%3B` for semicolon). |
| [options.bom] | <code>Number</code> |  | All responses are encoded in UTF-8 encoding. By default, the CSV files are prefixed with the UTF-8 Byte   Order Mark (BOM), while JSON, JSONL, XML, HTML and RSS files are not. If you want to override this default   behavior, set `bom` option to `true` to include the BOM, or set `bom` to `false` to skip it. |
| [options.xmlRoot] | <code>String</code> |  | Overrides the default root element name of the XML output. By default, the root element is `results`. |
| [options.xmlRow] | <code>String</code> |  | Overrides the default element name that wraps each page or page function result object in XML output.   By default, the element name is `page` or `result`, depending on the value of the `simplified` option. |
| [options.skipHeaderRow] | <code>Number</code> |  | If set to `1` then header row in csv format is skipped. |

<a name="Dataset+getInfo"></a>

### dataset.getInfo(opts) ⇒ <code>Promise</code>
Returns an object containing general information about the dataset.

**Kind**: instance method of [<code>Dataset</code>](#Dataset)  

| Param | Type |
| --- | --- |
| opts | <code>Object</code> | 

**Example**  
```js
{
  "id": "WkzbQMuFYuamGv3YF",
  "name": "d7b9MDYsbtX5L7XAj",
  "userId": "wRsJZtadYvn4mBZmm",
  "createdAt": "2015-12-12T07:34:14.202Z",
  "modifiedAt": "2015-12-13T08:36:13.202Z",
  "accessedAt": "2015-12-14T08:36:13.202Z",
  "itemsCount": 0
}
```
<a name="Dataset+forEach"></a>

### dataset.forEach(iteratee, opts, index) ⇒ <code>Promise.&lt;undefined&gt;</code>
Iterates over dataset items, yielding each in turn to an `iteratee` function.
Each invocation of `iteratee` is called with three arguments: `(element, index)`.

If `iteratee` returns a Promise then it is awaited before a next call.

**Kind**: instance method of [<code>Dataset</code>](#Dataset)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| iteratee | <code>function</code> |  |  |
| opts | <code>Opts</code> |  |  |
| [options.offset] | <code>Number</code> | <code>0</code> | Number of array elements that should be skipped at the start. |
| [options.desc] | <code>Number</code> |  | If `1` then the objects are sorted by `createdAt` in descending order. |
| [options.fields] | <code>Array</code> |  | If provided then returned objects will only contain specified keys |
| [options.unwind] | <code>String</code> |  | If provided then objects will be unwound based on provided field. |
| [options.limit] | <code>Number</code> | <code>250000</code> | How many items to load in one request. |
| index | <code>Number</code> |  | [description] |

<a name="Dataset+map"></a>

### dataset.map(iteratee, opts, index) ⇒ <code>Promise.&lt;Array&gt;</code>
Produces a new array of values by mapping each value in list through a transformation function (`iteratee`).
Each invocation of `iteratee` is called with three arguments: `(element, index)`.

If `iteratee` returns a `Promise` then it's awaited before a next call.

**Kind**: instance method of [<code>Dataset</code>](#Dataset)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| iteratee | <code>function</code> |  |  |
| opts | <code>Opts</code> |  |  |
| [options.offset] | <code>Number</code> | <code>0</code> | Number of array elements that should be skipped at the start. |
| [options.desc] | <code>Number</code> |  | If 1 then the objects are sorted by createdAt in descending order. |
| [options.fields] | <code>Array</code> |  | If provided then returned objects will only contain specified keys |
| [options.unwind] | <code>String</code> |  | If provided then objects will be unwound based on provided field. |
| [options.limit] | <code>Number</code> | <code>250000</code> | How many items to load in one request. |
| index | <code>Number</code> |  | [description] |

<a name="Dataset+reduce"></a>

### dataset.reduce(iteratee, memo, opts, index) ⇒ <code>Promise.&lt;\*&gt;</code>
Boils down a list of values into a single value.

Memo is the initial state of the reduction, and each successive step of it should be returned by `iteratee`.
The `iteratee` is passed three arguments: the `memo`, then the value and index of the iteration.

If no `memo` is passed to the initial invocation of reduce, the `iteratee` is not invoked on the first element of the list.
The first element is instead passed as the memo in the invocation of the `iteratee` on the next element in the list.

If `iteratee` returns a `Promise` then it's awaited before a next call.

**Kind**: instance method of [<code>Dataset</code>](#Dataset)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| iteratee | <code>function</code> |  |  |
| memo | <code>\*</code> |  |  |
| opts | <code>Opts</code> |  |  |
| [options.offset] | <code>Number</code> | <code>0</code> | Number of array elements that should be skipped at the start. |
| [options.desc] | <code>Number</code> |  | If 1 then the objects are sorted by createdAt in descending order. |
| [options.fields] | <code>Array</code> |  | If provided then returned objects will only contain specified keys |
| [options.unwind] | <code>String</code> |  | If provided then objects will be unwound based on provided field. |
| [options.limit] | <code>Number</code> | <code>250000</code> | How many items to load in one request. |
| index | <code>Number</code> |  | [description] |

<a name="Dataset+delete"></a>

### dataset.delete() ⇒ <code>Promise</code>
Removes the dataset either from the Apify cloud storage or from the local directory,
depending on the mode of operation.

**Kind**: instance method of [<code>Dataset</code>](#Dataset)  
