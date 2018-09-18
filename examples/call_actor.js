/**
 * This example demonstrates how to start an Apify actor using
 * <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#module-Apify-call"><code>Apify.call()</code></a>
 * and how to call Apify API using
 * <a href="https://www.apify.com/docs/sdk/apify-runtime-js/latest#module-Apify-client"><code>Apify.client</code></a>.
 * The script extracts the current Bitcoin prices from Kraken.com
 * and sends them to your email using the [apify/send-mail](https://www.apify.com/apify/send-mail) actor.
 *
 * To make the example work, you'll need an [Apify account](https://my.apify.com/).
 * Go to [Account - Integrations](https://my.apify.com/account#/integrations) page to obtain your API token
 * and set it to the `APIFY_TOKEN` environment variable, or run the script using the CLI.
 * If you deploy this actor to the Apify platform then you can set up a scheduler for early
 * morning. Don't miss the chance of your life to get rich!
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
    // the actor's documentation page: https://www.apify.com/apify/send-mail
    console.log(`Sending email to ${user.email}...`);
    await Apify.call('apify/send-mail', {
        to: user.email,
        subject: 'Kraken.com BTC',
        html: `<h1>Kraken.com BTC</h1>${tradedPricesHtml}`,
    });

    console.log('Email was sent. Good luck!');
});
