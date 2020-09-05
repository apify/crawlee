# Migration from 0.20.x to 0.21.0
There are 2 key changes to watch out for in version 0.21.0. We redesigned the way proxies
are used throughout the SDK, and we removed `Apify.utils.getRandomUserAgent()`.

## Proxy Configuration
Configuring proxies the way you were used to will no longer work in SDK 0.21.0.
To improve the proxy experience, we removed all the various proxy configuration
options scattered throughout the SDK and replaced them with a single
`ProxyConfiguration` class.

### Removal of `Apify.getApifyProxyUrl()`
This function has been fully replaced by the new `ProxyConfiguration` class.
Make sure to remove any references to it before upgrading.

### Usage with Apify Proxy:
The usage of Apify Proxy in SDK was inconsistent. Now, everything is pretty simple
and as a bonus, we validate your configuration at creation, so if there's something
wrong, you'll know right away, instead of seeing your crawlers fail with cryptic errors.

1. You create a `proxyConfiguration` instance.
2. Are you using `CheerioCrawler` or `PuppeteerCrawler`?
 - YES: You plug it into the crawler, and you're done.
 - NO: You call `proxyConfiguration.newUrl([sessionId])` to get your URL.

> `BasicCrawler` does not automatically use `ProxyConfiguration` because it does not make
any network requests (automatically).

That's it. See the examples.

```js
// before
const crawler = new Apify.PuppeteerCrawler({
    launchPuppeteerOptions: {
        useApifyProxy: true,
        apifyProxyGroups: ['GROUP1', 'GROUP2'],
    }
    // ...
})

// now
const proxyConfiguration = await Apify.createProxyConfiguration({
    groups: ['GROUP1', 'GROUP2'],
})

const crawler = new Apify.PuppeteerCrawler({
    proxyConfiguration,
    // ...
})
```

```js
// before
const browser = await Apify.launchPuppeteer({
    useApifyProxy: true,
    apifyProxyGroups: ['GROUP1', 'GROUP2'],
    apifyProxySession: 'session-123'
})

// now
const proxyConfiguration = await Apify.createProxyConfiguration({
    groups: ['GROUP1', 'GROUP2'],
});

const browser = await Apify.launchPuppeteer({
    proxyUrl: proxyConfiguration.newUrl('session-123')
})
```

#### PuppeteerCrawler warning
`ProxyConfiguration` integrates seamlessly with `PuppeteerCrawler`, but beware
wrong usage of `launchPuppeteerFunction`. It receives an options parameter
that should not be ignored. This is not new, it has always been like that,
but until now, only non-critical features were dependent on it, so you
might have been using it wrongly and never really noticed.

**Correct:**
```javascript
async function launchPuppeteerFunction(options) {
    const newOpts = {
        ...options,
        foo: 'bar',
    }
    // do some other things
    return Apify.launchPuppeteer(newOpts);
}
```
**Incorrect:**
```javascript
async function launchPuppeteerFunction() {
    const opts = {
      foo: 'bar',
    }
    // Because we ignored the options, correct parameters
    // will not make it to the browser. This prevents
    // proxyConfiguration from working correctly.
    return Apify.launchPuppeteer(opts);
}
```

### Usage with your own proxies:
Using your own proxies was possible, but it was difficult to find where to
enter your URLs to make use of them. Now it's the same as with Apify Proxy,
you just add them to the `ProxyConfiguration`. As a bonus, your custom proxies
can now also be managed by `SessionPool` which was not possible before.
So if one of your proxies goes bad, `SessionPool` will automatically
retire it from use.

```js
// before
const crawler = new Apify.PuppeteerCrawler({
    puppeteerPoolOptions: {
        proxyUrls: [
            'http://proxy1.com',
            'http://proxy2.com',
        ]
    }
    // ...
})

// now
const proxyConfiguration = await Apify.createProxyConfiguration({
    proxyUrls: [
        'http://proxy1.com',
        'http://proxy2.com',
    ]
})

const crawler = new Apify.PuppeteerCrawler({
    proxyConfiguration,
    // ...
})
```

```js
// before
const browser1 = await Apify.launchPuppeteer({
    proxyUrl: 'http://proxy1:com',
})

// now
const proxyConfiguration = await Apify.createProxyConfiguration({
    proxyUrls: [
        'http://proxy1.com',
        'http://proxy2.com',
    ]
});

const browser = await Apify.launchPuppeteer({
    proxyUrl: proxyConfiguration.newUrl('session-123'),
})
```

## Removal of random user agents

Nowadays, bot walls cannot be bypassed simply by rotating user agents.
Quite the opposite is true, using a user agent that does not match
the used browser / network stack, will most likely lead to
red flags and bans due to detected inconsistencies. For that reason,
we've decided to remove the `Apify.utils.getRandomUserAgent()` function,
effective immediately. Leaving a deprecation period would only have
your scrapers get blocked for longer. Please make sure you remove all
references to the function from your code.

```js
// before
const browser = await Apify.launchPuppeteer({
    userAgent: Apify.utils.getRandomUserAgent(),
})

// now, keep the default
const browser = await Apify.launchPuppeteer();
```
