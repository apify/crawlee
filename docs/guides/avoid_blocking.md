---
id: avoid-blocking
title: Avoid getting blocked
---

A Scraper might get blocked for numerous reasons. Let's narrow it down to two main reasons. The first one is a bad or blocked IP address. This topic is covered in the [proxy management guide](proxy_management.md). The second reason we will explore more is [browser fingerprints](https://pixelprivacy.com/resources/browser-fingerprinting/) or signatures.
Browser fingerprint is a collection of browser attributes and significant features that can show if your browser is a bot or a real user. Moreover, even most browsers have these unique features that allow the website to track the browser even within different IP addresses. This is the main reason why scrapers should change browser fingerprints while doing browser-based scraping. In addition, it should reduce blocking significantly.

Changing browser fingerprints can be a tedious job. Luckily, Apify SDK provides this feature out of the box with zero configuration necessary. Let's take a look at how it is done.

 Changing browser fingerprints is available in `PuppeteerCrawler` and `PlaywrightCrawler`. You have to pass the `useFingerprints` option to the `browserPoolOptions`.

 ```javascript
const crawler = new Apify.PlaywrightCrawler({
    browserPoolOptions: {
        useFingerprints: true,
    },
})

 ```
Now, it is all set. The fingerprints are going to be generated for the default browser and the operating system. The Crawler can have the generation alghoritm customized to reflect particular browser version and many more. Let's take a look at the example bellow:

 ```javascript
const crawler = new Apify.PlaywrightCrawler({
    browserPoolOptions: {
        useFingerprints: true,
        fingerprintOptions: {
            fingerprintGeneratorOptions: {
                browsers: [
                    { name: 'firefox', minVersion: 80 },
                    { name: 'chrome', minVersion: 87 },
                    'safari',
                ],
                devices: [
                    'desktop',
                ],
                operatingSystems: [
                    'windows',
                ],
            },
        },
    },
})

 ```
 Fingerprint generator has more options available check out the [Fingerprint generator docs](https://github.com/apify/fingerprint-generator#HeaderGeneratorOptions).
 