---
id: version-0.22.4-call-actor
title: Call actor
original_id: call-actor
---

This example demonstrates how to start an Apify actor using [`Apify.call()`](/docs/api/apify#call) and how to call the Apify API using
[`Apify.client`](/docs/api/apify#client). The script gets a random weird word and its explanation from [randomword.com](https://randomword.com/) and
sends it to your email using the [`apify/send-mail`](https://apify.com/apify/send-mail) actor.

To make the example work, you'll need an [Apify account](https://my.apify.com/). Go to the
[Account - Integrations](https://my.apify.com/account#/integrations) page to obtain your API token and set it to the
[`APIFY_TOKEN`](/docs/guides/environment-variables#APIFY_TOKEN) environment variable, or run the script using the Apify CLI. If you deploy this actor
to the Apify Cloud, you can do things like set up a scheduler to run your actor early in the morning.

To see what other actors are available, visit the [Apify Store](https://apify.com/store).

> To run this example on the Apify Platform, select the `Node.js 12 + Chrome on Debian (apify/actor-node-chrome)` base image on the **Source** tab
> when configuring the actor.

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Launch the web browser.
    const browser = await Apify.launchPuppeteer();

    console.log('Obtaining email address...');
    const user = await Apify.client.users.getUser();

    // Load randomword.com and get a random word
    console.log('Fetching a random word.');
    const page = await browser.newPage();
    await page.goto('https://randomword.com/');
    const randomWord = await page.$eval('#shared_section', el => el.outerHTML);

    // Send random word to your email. For that, you can use an actor we already
    // have available on the platform under the name: apify/send-mail.
    // The second parameter to the Apify.call() invocation is the actor's
    // desired input. You can find the required input parameters by checking
    // the actor's documentation page: https://apify.com/apify/send-mail
    console.log(`Sending email to ${user.email}...`);
    await Apify.call('apify/send-mail', {
        to: user.email,
        subject: 'Random Word',
        html: `<h1>Random Word</h1>${randomWord}`,
    });
    console.log('Email sent. Good luck!');

    // Close Browser
    await browser.close();
});
```
