---
id: dataset
title: Dataset
---

<a name="Dataset"></a>

The `Dataset` class represents a store for structured data where each object stored has the same attributes, such as online store products or real
estate offers. You can imagine it as a table, where each object is a row and its attributes are columns. Dataset is an append-only storage - you can
only add new records to it but you cannot modify or remove existing records. Typically it is used to store crawling results.

Do not instantiate this class directly, use the [`Apify.openDataset()`](apify#module_Apify.openDataset) function instead.

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
<a href="https://docs.apify.com/storage/dataset" target="_blank">Apify Dataset</a> cloud storage. Note that you can force usage of the cloud storage
also by passing the `forceCloud` option to [`Apify.openDataset()`](apify#module_Apify.openDataset) function, even if the `APIFY_LOCAL_STORAGE_DIR`
variable is set.

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

-   [Dataset](dataset)
    -   [`new exports.Dataset(datasetId, datasetName)`](#new_Dataset_new)
    -   [`.pushData(data)`](#Dataset+pushData) ⇒ `Promise<void>`
    -   [`.getData([options])`](#Dataset+getData) ⇒ [`Promise<DatasetContent>`](../typedefs/datasetcontent)
    -   [`.getInfo()`](#Dataset+getInfo) ⇒ `Promise<Object>`
    -   [`.forEach(iteratee, [options], [index])`](#Dataset+forEach) ⇒ `Promise<void>`
    -   [`.map(iteratee, options)`](#Dataset+map) ⇒ `Promise<Array<T>>`
    -   [`.reduce(iteratee, memo, options)`](#Dataset+reduce) ⇒ `Promise<T>`
    -   [`.drop()`](#Dataset+drop) ⇒ `Promise<void>`

<a name="new_Dataset_new"></a>

## `new exports.Dataset(datasetId, datasetName)`

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>datasetId</code></td><td><code>string</code></td>
</tr>
<tr>
</tr><tr>
<td><code>datasetName</code></td><td><code>string</code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="Dataset+pushData"></a>

## `dataset.pushData(data)` ⇒ `Promise<void>`

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

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>data</code></td><td><code>Object</code> | <code>Array</code></td>
</tr>
<tr>
<td colspan="3"><p>Object or array of objects containing data to be stored in the default dataset.
The objects must be serializable to JSON and the JSON representation of each object must be smaller than 9MB.</p>
</td></tr></tbody>
</table>
<a name="Dataset+getData"></a>

## `dataset.getData([options])` ⇒ [`Promise<DatasetContent>`](../typedefs/datasetcontent)

Returns {DatasetContent} object holding the items in the dataset based on the provided parameters.

**NOTE**: If using dataset with local disk storage, the `format` option must be `json` and the following options are not supported: `unwind`,
`disableBodyParser`, `attachment`, `bom` and `simplified`. If you try to use them, you will receive an error.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[options]</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>All <code>getData()</code> parameters are passed
  via an options object with the following keys:</p>
</td></tr><tr>
<td><code>[options.format]</code></td><td><code>String</code></td><td><code>&#x27;json&#x27;</code></td>
</tr>
<tr>
<td colspan="3"><p>Format of the <code>items</code> property, possible values are: <code>json</code>, <code>csv</code>, <code>xlsx</code>, <code>html</code>, <code>xml</code> and <code>rss</code>.</p>
</td></tr><tr>
<td><code>[options.offset]</code></td><td><code>Number</code></td><td><code>0</code></td>
</tr>
<tr>
<td colspan="3"><p>Number of array elements that should be skipped at the start.</p>
</td></tr><tr>
<td><code>[options.limit]</code></td><td><code>Number</code></td><td><code>250000</code></td>
</tr>
<tr>
<td colspan="3"><p>Maximum number of array elements to return.</p>
</td></tr><tr>
<td><code>[options.desc]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If <code>true</code> then the objects are sorted by <code>createdAt</code> in descending order.
  Otherwise they are sorted in ascending order.</p>
</td></tr><tr>
<td><code>[options.fields]</code></td><td><code>Array</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>An array of field names that will be included in the result. If omitted, all fields are included in the results.</p>
</td></tr><tr>
<td><code>[options.unwind]</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Specifies a name of the field in the result objects that will be used to unwind the resulting objects.
  By default, the results are returned as they are.</p>
</td></tr><tr>
<td><code>[options.disableBodyParser]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If <code>true</code> then response from API will not be parsed.</p>
</td></tr><tr>
<td><code>[options.attachment]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If <code>true</code> then the response will define the <code>Content-Disposition: attachment</code> HTTP header, forcing a web
  browser to download the file rather than to display it. By default, this header is not present.</p>
</td></tr><tr>
<td><code>[options.delimiter]</code></td><td><code>String</code></td><td><code>&#x27;,&#x27;</code></td>
</tr>
<tr>
<td colspan="3"><p>A delimiter character for CSV files, only used if <code>format</code> is <code>csv</code>.</p>
</td></tr><tr>
<td><code>[options.bom]</code></td><td><code>Boolean</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>All responses are encoded in UTF-8 encoding. By default, the CSV files are prefixed with the UTF-8 Byte
  Order Mark (BOM), while JSON, JSONL, XML, HTML and RSS files are not. If you want to override this default
  behavior, set <code>bom</code> option to <code>true</code> to include the BOM, or set <code>bom</code> to <code>false</code> to skip it.</p>
</td></tr><tr>
<td><code>[options.xmlRoot]</code></td><td><code>String</code></td><td><code>&#x27;results&#x27;</code></td>
</tr>
<tr>
<td colspan="3"><p>Overrides the default root element name of the XML output. By default, the root element is <code>results</code>.</p>
</td></tr><tr>
<td><code>[options.xmlRow]</code></td><td><code>String</code></td><td><code>&#x27;page&#x27;</code></td>
</tr>
<tr>
<td colspan="3"><p>Overrides the default element name that wraps each page or page function result object in XML output.
  By default, the element name is <code>page</code> or <code>result</code>, depending on the value of the <code>simplified</code> option.</p>
</td></tr><tr>
<td><code>[options.skipHeaderRow]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If set to <code>true</code> then header row in CSV format is skipped.</p>
</td></tr><tr>
<td><code>[options.clean]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If <code>true</code> then the function returns only non-empty items and skips hidden fields (i.e. fields starting with <code>#</code> character).
  Note that the <code>clean</code> parameter is a shortcut for <code>skipHidden: true</code> and <code>skipEmpty: true</code> options.</p>
</td></tr><tr>
<td><code>[options.skipHidden]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If <code>true</code> then the function doesn&#39;t return hidden fields (fields starting with &quot;#&quot; character).</p>
</td></tr><tr>
<td><code>[options.skipEmpty]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If <code>true</code> then the function doesn&#39;t return empty items.
  Note that in this case the returned number of items might be lower than limit parameter and pagination must be done using the <code>limit</code> value.</p>
</td></tr><tr>
<td><code>[options.simplified]</code></td><td><code>Boolean</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>If <code>true</code> then function applies the <code>fields: [&#39;url&#39;,&#39;pageFunctionResult&#39;,&#39;errorInfo&#39;]</code> and <code>unwind: &#39;pageFunctionResult&#39;</code> options.
  This feature is used to emulate simplified results provided by Apify API version 1 used for
  the legacy Apify Crawler and it&#39;s not recommended to use it in new integrations.</p>
</td></tr><tr>
<td><code>[options.skipFailedPages]</code></td><td><code>Boolean</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>If <code>true</code> then, the all the items with errorInfo property will be skipped from the output.
  This feature is here to emulate functionality of Apify API version 1 used for
  the legacy Apify Crawler product and it&#39;s not recommended to use it in new integrations.</p>
</td></tr></tbody>
</table>
<a name="Dataset+getInfo"></a>

## `dataset.getInfo()` ⇒ `Promise<Object>`

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

<a name="Dataset+forEach"></a>

## `dataset.forEach(iteratee, [options], [index])` ⇒ `Promise<void>`

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

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>iteratee</code></td><td><code><a href="../typedefs/datasetconsumer">DatasetConsumer</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>A function that is called for every item in the dataset.</p>
</td></tr><tr>
<td><code>[options]</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>All <code>forEach()</code> parameters are passed
  via an options object with the following keys:</p>
</td></tr><tr>
<td><code>[options.desc]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If <code>true</code> then the objects are sorted by <code>createdAt</code> in descending order.</p>
</td></tr><tr>
<td><code>[options.fields]</code></td><td><code>Array</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>If provided then returned objects will only contain specified keys.</p>
</td></tr><tr>
<td><code>[options.unwind]</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>If provided then objects will be unwound based on provided field.</p>
</td></tr><tr>
<td><code>[index]</code></td><td><code>Number</code></td><td><code>0</code></td>
</tr>
<tr>
<td colspan="3"><p>Specifies the initial index number passed to the <code>iteratee</code> function.</p>
</td></tr></tbody>
</table>
<a name="Dataset+map"></a>

## `dataset.map(iteratee, options)` ⇒ `Promise<Array<T>>`

Produces a new array of values by mapping each value in list through a transformation function `iteratee()`. Each invocation of `iteratee()` is called
with two arguments: `(element, index)`.

If `iteratee` returns a `Promise` then it's awaited before a next call.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>iteratee</code></td><td><code><a href="../typedefs/datasetmapper">DatasetMapper</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>options</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>All <code>map()</code> parameters are passed
  via an options object with the following keys:</p>
</td></tr><tr>
<td><code>[options.desc]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If <code>true</code> then the objects are sorted by createdAt in descending order.</p>
</td></tr><tr>
<td><code>[options.fields]</code></td><td><code>Array</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>If provided then returned objects will only contain specified keys</p>
</td></tr><tr>
<td><code>[options.unwind]</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>If provided then objects will be unwound based on provided field.</p>
</td></tr></tbody>
</table>
<a name="Dataset+reduce"></a>

## `dataset.reduce(iteratee, memo, options)` ⇒ `Promise<T>`

Reduces a list of values down to a single value.

Memo is the initial state of the reduction, and each successive step of it should be returned by `iteratee()`. The `iteratee()` is passed three
arguments: the `memo`, then the `value` and `index` of the iteration.

If no `memo` is passed to the initial invocation of reduce, the `iteratee()` is not invoked on the first element of the list. The first element is
instead passed as the memo in the invocation of the `iteratee()` on the next element in the list.

If `iteratee()` returns a `Promise` then it's awaited before a next call.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>iteratee</code></td><td><code><a href="../typedefs/datasetreducer">DatasetReducer</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>memo</code></td><td><code>T</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Initial state of the reduction.</p>
</td></tr><tr>
<td><code>options</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>All <code>reduce()</code> parameters are passed
  via an options object with the following keys:</p>
</td></tr><tr>
<td><code>[options.desc]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If <code>true</code> then the objects are sorted by createdAt in descending order.</p>
</td></tr><tr>
<td><code>[options.fields]</code></td><td><code>Array</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>If provided then returned objects will only contain specified keys</p>
</td></tr><tr>
<td><code>[options.unwind]</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>If provided then objects will be unwound based on provided field.</p>
</td></tr></tbody>
</table>
<a name="Dataset+drop"></a>

## `dataset.drop()` ⇒ `Promise<void>`

Removes the dataset either from the Apify cloud storage or from the local directory, depending on the mode of operation.
