---
id: result-storage
title: Result Storage
---

The Apify SDK has several result storage types that are useful for specific tasks. The data is stored either on local disk to a directory defined by the
`APIFY_LOCAL_STORAGE_DIR` environment variable, or on the [Apify platform](../guides/apify-platform) under the user account
identified by the API token defined by the `APIFY_TOKEN` environment variable. If neither of these variables is defined, by default Apify SDK sets
`APIFY_LOCAL_STORAGE_DIR` to `./apify_storage` in the current working directory and prints a warning.

Typically, you will be developing the code on your local computer and thus set the `APIFY_LOCAL_STORAGE_DIR` environment variable. Once the code is
ready, you will deploy it to the Apify platform, where it will automatically set the `APIFY_TOKEN` environment variable and thus use cloud storage. No
code changes are needed.

**Related links**

-   [Apify platform storage documentation](https://docs.apify.com/storage)
-   [View storage in Apify app](https://console.apify.com/storage)
-   [Key-value stores API reference](https://apify.com/docs/api/v2#/reference/key-value-stores)
-   [Datasets API reference](https://docs.apify.com/api/v2#/reference/datasets)

## Key-value store

The key-value store is used for saving and reading data records or files. Each data record is represented by a unique key and associated with a MIME
content type. Key-value stores are ideal for saving screenshots of web pages, PDFs or to persist the state of crawlers.

Each actor run is associated with a **default key-value store**, which is created exclusively for the actor run. By convention, the actor run input
and output is stored in the default key-value store under the `INPUT` and `OUTPUT` key, respectively. Typically the input and output is a JSON file,
although it can be any other format.

In the Apify SDK, the key-value store is represented by the [`KeyValueStore`](../api/key-value-store) class. In order to simplify access to the default
key-value store, the SDK also provides [`Apify.getValue()`](../api/apify#getvalue) and
[`Apify.setValue()`](../api/apify#setvalue) functions.

In local configuration, the data is stored in the directory specified by the `APIFY_LOCAL_STORAGE_DIR` environment variable as follows:

```
{APIFY_LOCAL_STORAGE_DIR}/key_value_stores/{STORE_ID}/{KEY}.{EXT}
```

Note that `{STORE_ID}` is the name or ID of the key-value store. The default key value store has ID `default`, unless you override it by setting the
`APIFY_DEFAULT_KEY_VALUE_STORE_ID` environment variable. The `{KEY}` is the key of the record and `{EXT}` corresponds to the MIME content type of the
data value.

The following code demonstrates basic operations of key-value stores:

```javascript
// Get actor input from the default key-value store
const input = await Apify.getInput();

// Write actor output to the default key-value store.
await Apify.setValue('OUTPUT', { myResult: 123 });

// Open a named key-value store
const store = await Apify.openKeyValueStore('some-name');

// Write record. JavaScript object is automatically converted to JSON,
// strings and binary buffers are stored as they are
await store.setValue('some-key', { foo: 'bar' });

// Read record. Note that JSON is automatically parsed to a JavaScript object,
// text data returned as a string and other data is returned as binary buffer
const value = await store.getValue('some-key');

// Delete record
await store.setValue('some-key', null);
```

To see a real-world example of how to get the input from the key-value store, see the [Screenshots](../examples/screenshots) example.

## Dataset

Datasets are used to store structured data where each object stored has the same attributes, such as online store products or real estate offers. You
can imagine a dataset as a table, where each object is a row and its attributes are columns. Dataset is an append-only storage - you can only add new
records to it but you cannot modify or remove existing records.

When the dataset is stored on the [Apify platform](../guides/apify-platform), you can export its data to the following formats: HTML,
JSON, CSV, Excel, XML and RSS. The datasets are displayed on the actor run details page and in the
[Storage](https://console.apify.com/storage) section in the Apify app. The actual data is exported using the
[Get dataset items](https://apify.com/docs/api/v2#/reference/datasets/item-collection/get-items) Apify API endpoint. This
way you can easily share crawling results.

Each actor run is associated with a **default dataset**, which is created exclusively for the actor run. Typically, it is used to store crawling
results specific for the actor run. Its usage is optional.

In the Apify SDK, the dataset is represented by the [`Dataset`](../api/dataset) class. In order to simplify writes to the default dataset, the SDK
also provides the [`Apify.pushData()`](../api/apify#pushdata) function.

In local configuration, the data is stored in the directory specified by the `APIFY_LOCAL_STORAGE_DIR` environment variable as follows:

```
{APIFY_LOCAL_STORAGE_DIR}/datasets/{DATASET_ID}/{INDEX}.json
```

Note that `{DATASET_ID}` is the name or ID of the dataset. The default dataset has ID `default`, unless you override it by setting the
`APIFY_DEFAULT_DATASET_ID` environment variable. Each dataset item is stored as a separate JSON file, where `{INDEX}` is a zero-based index of the
item in the dataset.

The following code demonstrates basic operations of the dataset:

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

To see how to use the dataset to store crawler results, see the [Cheerio Crawler](../examples/cheerio-crawler) example.
