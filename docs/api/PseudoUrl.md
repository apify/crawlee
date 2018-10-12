---
id: pseudourl
title: PseudoUrl
---
<a name="exp_module_PseudoUrl--PseudoUrl"></a>

Represents a pseudo URL (PURL) - an URL pattern used by web crawlers
to specify which URLs should the crawler visit.
This class is used by the {@linkcode enqueueLinks|Apify.utils.puppeteer.enqueueLinks()} function.

A PURL is simply a URL with special directives enclosed in `[]` brackets.
Currently, the only supported directive is `[regexp]`,
which defines a JavaScript-style regular expression to match against the URL.

For example, a PURL `http://www.example.com/pages/[(\w|-)*]` will match all of the following URLs:

<ul>
    <li>`http://www.example.com/pages/`</li>
    <li>`http://www.example.com/pages/my-awesome-page`</li>
    <li>`http://www.example.com/pages/something`</li>
</ul>

If either `[` or `]` is part of the normal query string, it must be encoded as `[\x5B]` or `[\x5D]`,
respectively. For example, the following PURL:
```
http://www.example.com/search?do[\x5B]load[\x5D]=1
```
will match the URL:
```
http://www.example.com/search?do[load]=1
```

**Example usage:**

```javascript
const purl = new Apify.PseudoUrl('http://www.example.com/pages/[(\w|-)*]');

if (purl.matches('http://www.example.com/pages/my-awesome-page')) console.log('Match!');
```

**See**

- {@linkcode Request}
- {@linkcode Request}

* [PseudoUrl](#exp_module_PseudoUrl--PseudoUrl) ⏏
    * [`new PseudoUrl(purl, requestTemplate)`](#new_module_PseudoUrl--PseudoUrl_new)
    * [`.matches(url)`](pseudourl--PseudoUrl+matches) ⇒ <code>Boolean</code>
    * [`.createRequest(url)`](pseudourl--PseudoUrl+createRequest) ⇒ <code>Request</code>

<a name="new_module_PseudoUrl--PseudoUrl_new"></a>

## `new PseudoUrl(purl, requestTemplate)`
<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>purl</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Pseudo URL.</p>
</td></tr><tr>
<td><code>requestTemplate</code></td><td><code>Object</code></td>
</tr>
<tr>
<td colspan="3"><p>Options for the new {@linkcode Request} instances created for matching URLs.</p>
</td></tr></tbody>
</table>
<a name="module_PseudoUrl--PseudoUrl+matches"></a>

## `pseudoUrl.matches(url)` ⇒ <code>Boolean</code>
Determines whether a URL matches this pseudo-URL pattern.

**Returns**: <code>Boolean</code> - Returns `true` if given URL matches pseudo URL.  
<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>url</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>URL to be matched.</p>
</td></tr></tbody>
</table>
<a name="module_PseudoUrl--PseudoUrl+createRequest"></a>

## `pseudoUrl.createRequest(url)` ⇒ <code>Request</code>
Creates a Request object from requestTemplate and given URL.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>url</code></td><td><code>String</code></td>
</tr>
<tr>
</tr></tbody>
</table>
