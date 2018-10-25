---
id: keyvaluestore
title: KeyValueStore
---
<a name="KeyValueStore"></a>

The `KeyValueStore` class represents a key-value store, a simple data storage that is used
for saving and reading data records or files. Each data record is
represented by a unique key and associated with a MIME content type. Key-value stores are ideal
for saving screenshots, actor inputs and outputs, web pages, PDFs or to persist the state of crawlers.

Do not instantiate this class directly, use the
[`Apify.openKeyValueStore()`](apify#module_Apify.openKeyValueStore) function instead.

Each actor run is associated with a default key-value store, which is created exclusively
for the run. By convention, the actor input and output are stored into the
default key-value store under the `INPUT` and `OUTPUT` key, respectively.
Typically, input and output are JSON files, although it can be any other format.
To access the default key-value store directly, you can use the
[`Apify.getValue()`](apify#module_Apify.getValue)
and [`Apify.setValue()`](apify#module_Apify.setValue) convenience functions.

`KeyValueStore` stores its data either on local disk or in the Apify cloud,
depending on whether the `APIFY_LOCAL_STORAGE_DIR` or `APIFY_TOKEN` environment variables are set.

If the `APIFY_LOCAL_STORAGE_DIR` environment variable is set, the data is stored in
the local directory in the following files:
```
{APIFY_LOCAL_STORAGE_DIR}/key_value_stores/{STORE_ID}/{INDEX}.{EXT}
```
Note that `{STORE_ID}` is the name or ID of the key-value store. The default key value store has ID: `default`,
unless you override it by setting the `APIFY_DEFAULT_KEY_VALUE_STORE_ID` environment variable.
The `{KEY}` is the key of the record and `{EXT}` corresponds to the MIME content type of the data value.

If the `APIFY_TOKEN` environment variable is provided instead, the data is stored in the
<a href="https://www.apify.com/docs/storage#key-value-store" target="_blank">Apify Key-Value Store</a>
cloud storage.

**Example usage:**

```javascript
// Get actor input from the default key-value store
const input = await Apify.getValue('INPUT');

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

 // Delete record
await store.delete('some-key');
```


* [KeyValueStore](keyvaluestore)
    * [`.getValue(key)`](#KeyValueStore+getValue) ⇒ <code>Promise&lt;(Object\|String\|Buffer)&gt;</code>
    * [`.setValue(key, value, [options])`](#KeyValueStore+setValue) ⇒ <code>Promise</code>
    * [`.delete()`](#KeyValueStore+delete) ⇒ <code>Promise</code>

<a name="KeyValueStore+getValue"></a>

## `keyValueStore.getValue(key)` ⇒ <code>Promise&lt;(Object\|String\|Buffer)&gt;</code>
Gets a value from the key-value store.

The function returns a `Promise` that resolves to the record value,
whose JavaScript type depends on the MIME content type of the record.
Records with the `application/json`
content type are automatically parsed and returned as a JavaScript object.
Similarly, records with `text/plain` content types are returned as a string.
For all other content types, the value is returned as a raw
<a href="https://nodejs.org/api/buffer.html" target="_blank"><code>Buffer</code></a> instance.

If the record does not exist, the function resolves to `null`.

To save or delete a value in the key-value store, use the
[`setValue`](#KeyValueStore+setValue) function.

**Example usage:**

```javascript
const store = await Apify.openKeyValueStore('my-screenshots');
const buffer = await store.getValue('screenshot1.png');
```

**Returns**: <code>Promise&lt;(Object\|String\|Buffer)&gt;</code> - Returns a promise that resolves to an object, string
  or <a href="https://nodejs.org/api/buffer.html" target="_blank"><code>Buffer</code></a>, depending
  on the MIME content type of the record.  
<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>key</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Unique key of the record.</p>
</td></tr></tbody>
</table>
<a name="KeyValueStore+setValue"></a>

## `keyValueStore.setValue(key, value, [options])` ⇒ <code>Promise</code>
Saves or deletes a record in the key-value store.
The function returns a promise that resolves once the record has been saved or deleted.

**Example usage:**

```javascript
const store = await Apify.openKeyValueStore('my-store');
await store.setValue('RESULTS', 'my text data', { contentType: 'text/plain' });
```

By default, `value` is converted to JSON and stored with the
`application/json; charset=utf-8` MIME content type.
To store the value with another content type, pass it in the options as follows:
```javascript
const store = await Apify.openKeyValueStore('my-store');
await store.setValue('RESULTS', 'my text data', { contentType: 'text/plain' });
```
If you set custom content type, `value` must be either a string or
<a href="https://nodejs.org/api/buffer.html" target="_blank"><code>Buffer</code></a>, otherwise an error will be thrown.

If `value` is `null`, the record is deleted instead. Note that the `setValue()` function succeeds
regardless whether the record existed or not.

To retrieve a value from the key-value store, use the
[`getValue`](#KeyValueStore+getValue) function.

**IMPORTANT:** Always make sure to use the `await` keyword when calling `setValue()`,
otherwise the actor process might finish before the value is stored!

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>key</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Unique key of the record.</p>
</td></tr><tr>
<td><code>value</code></td><td><code>Object</code> | <code>String</code> | <code>Buffer</code></td>
</tr>
<tr>
<td colspan="3"><p>Record data, which can be one of the following values:
  <ul>
    <li>If <code>null</code>, the record in the key-value store is deleted.</li>
    <li>If no <code>options.contentType</code> is specified, <code>value</code> can be any JavaScript object and it will be stringified to JSON.</li>
    <li>If <code>options.contentType</code> is specified, <code>value</code> is considered raw data and it must be either a <code>String</code>
    or <a href="https://nodejs.org/api/buffer.html" target="_blank"><code>Buffer</code></a>.</li>
  </ul>
  For any other value an error will be thrown.</p>
</td></tr><tr>
<td><code>[options]</code></td><td><code>Object</code></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>[options.contentType]</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Specifies a custom MIME content type of the record.</p>
</td></tr></tbody>
</table>
<a name="KeyValueStore+delete"></a>

## `keyValueStore.delete()` ⇒ <code>Promise</code>
Removes the key-value store either from the Apify cloud storage or from the local directory,
depending on the mode of operation.

