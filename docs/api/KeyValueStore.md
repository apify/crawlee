---
id: key-value-store
title: KeyValueStore
---

<a name="keyvaluestore"></a>

The `KeyValueStore` class represents a key-value store, a simple data storage that is used for saving and reading data records or files. Each data
record is represented by a unique key and associated with a MIME content type. Key-value stores are ideal for saving screenshots, actor inputs and
outputs, web pages, PDFs or to persist the state of crawlers.

Do not instantiate this class directly, use the [`Apify.openKeyValueStore()`](/docs/api/apify#openkeyvaluestore) function instead.

Each actor run is associated with a default key-value store, which is created exclusively for the run. By convention, the actor input and output are
stored into the default key-value store under the `INPUT` and `OUTPUT` key, respectively. Typically, input and output are JSON files, although it can
be any other format. To access the default key-value store directly, you can use the [`Apify.getValue()`](/docs/api/apify#getvalue) and
[`Apify.setValue()`](/docs/api/apify#setvalue) convenience functions.

To access the input, you can also use the [`Apify.getInput()`](/docs/api/apify#getinput) convenience function.

`KeyValueStore` stores its data either on local disk or in the Apify cloud, depending on whether the
[`APIFY_LOCAL_STORAGE_DIR`](/docs/guides/environment-variables#APIFY_LOCAL_STORAGE_DIR) or
[`APIFY_TOKEN`](/docs/guides/environment-variables#APIFY_TOKEN) environment variables are set.

If the `APIFY_LOCAL_STORAGE_DIR` environment variable is set, the data is stored in the local directory in the following files:

```
{APIFY_LOCAL_STORAGE_DIR}/key_value_stores/{STORE_ID}/{INDEX}.{EXT}
```

Note that `{STORE_ID}` is the name or ID of the key-value store. The default key value store has ID: `default`, unless you override it by setting the
`APIFY_DEFAULT_KEY_VALUE_STORE_ID` environment variable. The `{KEY}` is the key of the record and `{EXT}` corresponds to the MIME content type of the
data value.

If the [`APIFY_TOKEN`](/docs/guides/environment-variables#APIFY_TOKEN) environment variable is set but
[`APIFY_LOCAL_STORAGE_DIR`](/docs/guides/environment-variables#APIFY_LOCAL_STORAGE_DIR) not, the data is stored in the
[Apify Key-value store](https://docs.apify.com/storage/key-value-store) cloud storage. Note that you can force usage of the cloud storage also by
passing the `forceCloud` option to [`Apify.openKeyValueStore()`](/docs/api/apify#openkeyvaluestore) function, even if the
[`APIFY_LOCAL_STORAGE_DIR`](/docs/guides/environment-variables#APIFY_LOCAL_STORAGE_DIR) variable is set.

**Example usage:**

```javascript
// Get actor input from the default key-value store
const input = await Apify.getInput();
const otherValue = Apify.getValue('my-key');

// Write actor output to the default key-value store.
await Apify.setValue('OUTPUT', { myResult: 123 });

// Open a named key-value store
const store = await Apify.openKeyValueStore('some-name');

// Write a record. JavaScript object is automatically converted to JSON,
// strings and binary buffers are stored as they are
await store.setValue('some-key', { foo: 'bar' });

// Read a record. Note that JSON is automatically parsed to a JavaScript object,
// text data returned as a string and other data is returned as binary buffer
const value = await store.getValue('some-key');

// Drop (delete) the store
await store.drop();
```

---

<a name="exports.keyvaluestore"></a>

## `new KeyValueStore(storeId, storeName)`

**Params**

-   **`storeId`**: `string`
-   **`storeName`**: `string`

---

<a name="getvalue"></a>

## `keyValueStore.getValue(key)`

**Returns**: `Promise<(object|Buffer|string|null)>` - Returns a promise that resolves to an object, string or [](https://nodejs.org/api/buffer.html),
depending on the MIME content type of the record.

Gets a value from the key-value store.

The function returns a `Promise` that resolves to the record value, whose JavaScript type depends on the MIME content type of the record. Records with
the `application/json` content type are automatically parsed and returned as a JavaScript object. Similarly, records with `text/plain` content types
are returned as a string. For all other content types, the value is returned as a raw [](https://nodejs.org/api/buffer.html) instance.

If the record does not exist, the function resolves to `null`.

To save or delete a value in the key-value store, use the [`KeyValueStore.setValue()`](/docs/api/key-value-store#setvalue) function.

**Example usage:**

```javascript
const store = await Apify.openKeyValueStore();
const buffer = await store.getValue('screenshot1.png');
```

**Params**

-   **`key`**: `string` - Unique key of the record. It can be at most 256 characters long and only consist of the following characters: `a`-`z`,
    `A`-`Z`, `0`-`9` and `!-_.'()`

---

<a name="setvalue"></a>

## `keyValueStore.setValue(key, value, [options])`

**Returns**: `Promise<void>`

Saves or deletes a record in the key-value store. The function returns a promise that resolves once the record has been saved or deleted.

**Example usage:**

```javascript
const store = await Apify.openKeyValueStore();
await store.setValue('OUTPUT', { foo: 'bar' });
```

Beware that the key can be at most 256 characters long and only contain the following characters: `a-zA-Z0-9!-_.'()`

By default, `value` is converted to JSON and stored with the `application/json; charset=utf-8` MIME content type. To store the value with another
content type, pass it in the options as follows:

```javascript
const store = await Apify.openKeyValueStore('my-text-store');
await store.setValue('RESULTS', 'my text data', { contentType: 'text/plain' });
```

If you set custom content type, `value` must be either a string or [](https://nodejs.org/api/buffer.html), otherwise an error will be thrown.

If `value` is `null`, the record is deleted instead. Note that the `setValue()` function succeeds regardless whether the record existed or not.

To retrieve a value from the key-value store, use the [`KeyValueStore.getValue()`](/docs/api/key-value-store#getvalue) function.

**IMPORTANT:** Always make sure to use the `await` keyword when calling `setValue()`, otherwise the actor process might finish before the value is
stored!

**Params**

-   **`key`**: `string` - Unique key of the record. It can be at most 256 characters long and only consist of the following characters: `a`-`z`,
    `A`-`Z`, `0`-`9` and `!-_.'()`
-   **`value`**: `Object` | `string` | `Buffer` | `null` - Record data, which can be one of the following values:
    <ul>
      <li>If `null`, the record in the key-value store is deleted.</li>
      <li>If no `options.contentType` is specified, `value` can be any JavaScript object and it will be stringified to JSON.</li>
      <li>If `options.contentType` is specified, `value` is considered raw data and it must be either a `String`
      or [](https://nodejs.org/api/buffer.html).</li>
    </ul>
    For any other value an error will be thrown.
-   **`[options]`**: `Object`
    -   **`[.contentType]`**: `string` - Specifies a custom MIME content type of the record.

---

<a name="drop"></a>

## `keyValueStore.drop()`

**Returns**: `Promise<void>`

Removes the key-value store either from the Apify cloud storage or from the local directory, depending on the mode of operation.

---

<a name="getpublicurl"></a>

## `keyValueStore.getPublicUrl(key)`

**Returns**: `string`

Returns a URL for the given key that may be used to publicly access the value in the remote key value store.

**Params**

-   **`key`**: `string`

---

<a name="foreachkey"></a>

## `keyValueStore.forEachKey(iteratee, [options])`

**Returns**: `Promise<void>`

Iterates over key value store keys, yielding each in turn to an `iteratee` function. Each invocation of `iteratee` is called with three arguments:
`(key, index, info)`, where `key` is the record key, `index` is a zero-based index of the key in the current iteration (regardless of
`options.exclusiveStartKey`) and `info` is an object that contains a single property `size` indicating size of the record in bytes.

If the `iteratee` function returns a Promise then it is awaited before the next call. If it throws an error, the iteration is aborted and the
`forEachKey` function throws the error.

**Example usage**

```javascript
const keyValueStore = await Apify.openKeyValueStore();
await keyValueStore.forEachKey(async (key, index, info) => {
    console.log(`Key at ${index}: ${key} has size ${info.size}`);
});
```

**Params**

-   **`iteratee`**: [`KeyConsumer`](/docs/typedefs/key-consumer) - A function that is called for every key in the key value store.
-   **`[options]`**: `Object` - All `forEachKey()` parameters are passed via an options object with the following keys:
    -   **`[.exclusiveStartKey]`**: `string` - All keys up to this one (including) are skipped from the result.

---
