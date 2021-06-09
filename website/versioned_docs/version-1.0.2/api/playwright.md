---
id: version-1.0.2-playwright
title: utils.playwright
original_id: playwright
---

<a name="playwright"></a>

A namespace that contains various utilities for [Playwright](https://github.com/microsoft/playwright) - the headless Chrome Node API.

**Example usage:**

```javascript
const Apify = require('apify');
const { playwright } = Apify.utils;

// Navigate to https://www.example.com in Playwright with a POST request
const browser = await Apify.launchPlaywright();
const page = await browser.newPage();
await playwright.gotoExtended(page, {
    url: 'https://example.com,
    method: 'POST',
});
```

---

<a name="gotoextended"></a>

## `playwright.gotoExtended`

Extended version of Playwright's `page.goto()` allowing to perform requests with HTTP method other than GET, with custom headers and POST payload.
URL, method, headers and payload are taken from request parameter that must be an instance of Apify.Request class.

_NOTE:_ In recent versions of Playwright using requests other than GET, overriding headers and adding payloads disables browser cache which degrades
performance.

**Parameters**:

-   **`page`**: `Page` - Puppeteer [`Page`](https://playwright.dev/docs/api/class-page) object.
-   **`request`**: [`Request`](../api/request)
-   **`[gotoOptions]`**: [`DirectNavigationOptions`](../typedefs/direct-navigation-options) - Custom options for `page.goto()`.

**Returns**:

`Promise<(Response|null)>`

---
