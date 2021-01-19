---
id: version-0.22.4-pseudo-url
title: PseudoUrl
original_id: pseudo-url
---

<a name="pseudourl"></a>

Represents a pseudo-URL (PURL) - an URL pattern used by web crawlers to specify which URLs should the crawler visit. This class is used by the
[`utils.enqueueLinks()`](../api/utils#enqueuelinks) function.

A PURL is simply a URL with special directives enclosed in `[]` brackets. Currently, the only supported directive is `[RegExp]`, which defines a
JavaScript-style regular expression to match against the URL.

The `PseudoUrl` class can be constructed either using a pseudo-URL string or a regular expression (an instance of the `RegExp` object). With a
pseudo-URL string, the matching is always case-insensitive. If you need case-sensitive matching, use an appropriate `RegExp` object.

For example, a PURL `http://www.example.com/pages/[(\w|-)*]` will match all of the following URLs:

-   `http://www.example.com/pages/`
-   `http://www.example.com/pages/my-awesome-page`
-   `http://www.example.com/pages/something`

Be careful to correctly escape special characters in the pseudo-URL string. If either `[` or `]` is part of the normal query string, it must be
encoded as `[\x5B]` or `[\x5D]`, respectively. For example, the following PURL:

```http
http://www.example.com/search?do[\x5B]load[\x5D]=1
```

will match the URL:

```http
http://www.example.com/search?do[load]=1
```

If the regular expression in the pseudo-URL contains a backslash character (\), you need to escape it with another back backslash, as shown in the
example below.

**Example usage:**

```javascript
// Using a pseudo-URL string
const purl = new Apify.PseudoUrl('http://www.example.com/pages/[(\\w|-)+]', {
    userData: { foo: 'bar' },
});

// Using a regular expression
const purl2 = new Apify.PseudoUrl(/http:\/\/www\.example\.com\/pages\/(\w|-)+/);

if (purl.matches('http://www.example.com/pages/my-awesome-page')) console.log('Match!');
```

---

<a name="pseudourl"></a>

## `new PseudoUrl(purl, requestTemplate)`

**Parameters**:

-   **`purl`**: `string` | `RegExp` - A pseudo-URL string or a regular expression object. Using a `RegExp` instance enables more granular control,
    such as making the matching case sensitive.
-   **`requestTemplate`**: [`RequestOptions`](../typedefs/request-options) - Options for the new [`Request`](../api/request) instances created for
    matching URLs by the [`utils.enqueueLinks()`](../api/utils#enqueuelinks) function.

---

<a name="matches"></a>

## `pseudoUrl.matches(url)`

Determines whether a URL matches this pseudo-URL pattern.

**Parameters**:

-   **`url`**: `string` - URL to be matched.

**Returns**:

`boolean` - Returns `true` if given URL matches pseudo-URL.

---

<a name="createrequest"></a>

## `pseudoUrl.createRequest(urlOrProps)`

Creates a Request object from a provided `requestTemplate` and a given URL or an object that specifies \$[`Request`](../api/request) properties. In
case of a collision the properties will override the template, except for `userData`, which will be merged together, with the `userData` property
having preference over the template. This enables dynamic overriding of the template.

**Parameters**:

-   **`urlOrProps`**: `string` | `Object`

**Returns**:

[`Request`](../api/request)

---
