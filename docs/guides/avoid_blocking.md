---
id: avoid-blocking-fingerprints
title: Avoid getting blocked
---
TODO: this is only for browser based scraping, we should reflected in the name somehow... IMHO browser fingerprinting does not reflect that it actually reduces blocking.


Your scraper migth get block for a numerous reason. Let's narrrow it down to two main reasons. The firs one is bad or blocked ip address. This topic is covered in the [proxy management guide](proxy_management.md). The second reason which we are going to explore more is browser fingerprints or signatures.
Browser fingerprint is collection of browser attributes and significant features that can show if your browser is bot or a real user TODO: We could link the academy here in future. Moreover even most browsers have these features unique, that allows the website to track you even within different IP addresses. This is the main reason why you should change browser fingerprints while doing browser based scraping. It should reduce blocking significantly.

Changing browser fingerprint can be a tedius job, luckilly Apify SDK provides this feature out of the box with zero configuration neccessery. Let's take a look how it is done.

 Changing browser fingerprints is available in both `PuppeteerCrawler` and `PlaywrightCrawler`. You have to pass `useFingerprints` option to the `browserPoolOptions`.

 ```javascript
 const crawler = new Apify.PlaywrightCrawler({
     browserPoolOptions:{
         useFingerprints: true,
     }
 })

 ```
You are all set, now the fingerprints are going to be generated for the default browser and the operating system. You can customize the generation alghoritm to reflect particular browser version and many more. Let's take a look at the example bellow:

 ```javascript
 const crawler = new Apify.PlaywrightCrawler({
     browserPoolOptions:{
         useFingerprints: true,
         fingerprintOptions:{
             fingerprintGeneratorOptions:{
                browsers: [
                     {name: "firefox", minVersion: 80},
                     {name: "chrome", minVersion: 87},
                    "safari"
                 ],
                devices: [
                    "desktop"
                 ],
                operatingSystems: [
                    "windows"
                 ]
             }
         }
     }
 })

 ```
 Fingerprint generator has more options available checkout the [Fingerprint generator docs](https://github.com/apify/fingerprint-generator#HeaderGeneratorOptions).
 