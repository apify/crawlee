---
id: version-1.0.2-direct-navigation-options
title: DirectNavigationOptions
original_id: direct-navigation-options
---

<a name="directnavigationoptions"></a>

## Properties

### `timeout`

**Type**: `number`

Maximum operation time in milliseconds, defaults to 30 seconds, pass `0` to disable timeout. The default value can be changed by using the
browserContext.setDefaultNavigationTimeout(timeout), browserContext.setDefaultTimeout(timeout), page.setDefaultNavigationTimeout(timeout) or
page.setDefaultTimeout(timeout) methods.

---

### `waitUntil`

**Type**: `&quot;domcontentloaded&quot;` | `&quot;load&quot;` | `&quot;networkidle&quot;`

When to consider operation succeeded, defaults to `load`. Events can be either: - `'domcontentloaded'` - consider operation to be finished when the
`DOMContentLoaded` event is fired. - `'load'` - consider operation to be finished when the `load` event is fired. - `'networkidle'` - consider
operation to be finished when there are no network connections for at least `500` ms.

---

### `referer`

**Type**: `string`

Referer header value. If provided it will take preference over the referer header value set by page.setExtraHTTPHeaders(headers).

---
