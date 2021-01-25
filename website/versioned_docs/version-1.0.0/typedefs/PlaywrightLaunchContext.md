---
id: version-1.0.0-playwright-launch-context
title: PlaywrightLaunchContext
original_id: playwright-launch-context
---

<a name="playwrightlaunchcontext"></a>

Apify extends the launch options of Playwright. You can use any of the Playwright compatible
[`LaunchOptions`](https://playwright.dev/docs/api/class-browsertype#browsertypelaunchoptions) options by providing the `launchOptions` property.

**Example:**

```js
// launch a headless Chrome (not Chromium)
const launchContext = {
    // Apify helpers
    useChrome: true,
    proxyUrl: 'http://user:password@some.proxy.com'
    // Native Playwright options
    launchOptions: {
        headless: true,
        args: ['--some-flag'],
    }
}
```

## Properties

### `launchOptions`

**Type**: `object`

`browserType.launch` [options](https://playwright.dev/docs/api/class-browsertype?_highlight=launch#browsertypelaunchoptions)

---

### `proxyUrl`

**Type**: `string`

URL to a HTTP proxy server. It must define the port number, and it may also contain proxy username and password.

Example: `http://bob:pass123@proxy.example.com:1234`.

---

### `useChrome`

**Type**: `boolean` <code> = false</code>

If `true` and `executablePath` is not set, Playwright will launch full Google Chrome browser available on the machine rather than the bundled
Chromium. The path to Chrome executable is taken from the `APIFY_CHROME_EXECUTABLE_PATH` environment variable if provided, or defaults to the typical
Google Chrome executable location specific for the operating system. By default, this option is `false`.

---

### `launcher`

**Type**: `Object`

By default this function uses `require("playwright").chromium`. If you want to use a different browser you can pass it by this property as e.g.
`require("playwright").firefox`

---
