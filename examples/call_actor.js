/**
 * This example demonstrates how to start an Apify actor using
 * [`Apify.call()`](/docs/api/apify#call) and how to call Apify API using
 * [`Apify.client`](/docs/api/apify#client).
 * The script extracts the current Bitcoin prices from [Kraken.com](https://www.kraken.com/)
 * and sends them to your email using the [`apify/send-mail`](https://apify.com/apify/send-mail) actor.
 *
 * To make the example work, you'll need an [Apify Account](https://my.apify.com/).
 * Go to [Account - Integrations](https://my.apify.com/account#/integrations) page to obtain your API token
 * and set it to the [`APIFY_TOKEN`](/docs/guides/environment-variables#APIFY_TOKEN) environment variable, or run the script using the CLI.
 * If you deploy this actor to the Apify Cloud then you can set up a scheduler for early
 * morning.
 *
 * To run this example on the Apify Platform, select the `Node.js 12 + Chrome on Debian (apify/actor-node-chrome)` base image
 * on the source tab of your actor configuration.
 */

const Apify = require('apify');

Apify.main(async () => {
    // Launch the web browser.
    const browser = await Apify.launchPuppeteer();

    console.log('Obtaining email address...');
    const user = await Apify.client.users.getUser();

    // Load Kraken.com charts and get last traded price of BTC
    console.log('Extracting data from kraken.com...');
    const page = await browser.newPage();
    await page.goto('https://www.kraken.com/charts');
    const tradedPricesHtml = await page.$eval('#ticker-top ul', el => el.outerHTML);

    // Send prices to your email. For that, you can use an actor we already
    // have available on the platform under the name: apify/send-mail.
    // The second parameter to the Apify.call() invocation is the actor's
    // desired input. You can find the required input parameters by checking
    // the actor's documentation page: https://apify.com/apify/send-mail
    console.log(`Sending email to ${user.email}...`);
    await Apify.call('apify/send-mail', {
        to: user.email,
        subject: 'Kraken.com BTC',
        html: `<h1>Kraken.com BTC</h1>${tradedPricesHtml}`,
    });

    console.log('Email sent. Good luck!');
});
