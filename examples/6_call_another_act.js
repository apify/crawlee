/**
 * This example shows how to call another actor - in this case apify/send-mail to send
 * an email.
 *
 * For this demonstration, we've chosen to scrape BTC prices. If you don't want to miss the chance of
 * of your life then you can use this code to get current BTC prices from Kraken.com
 * and mail them to your mailbox.
 *
 * If you deploy this actor to Apify platform then you can setup a scheduler for early
 * morning.
 *
 * Example uses:
 * - Apify.launchPuppeteer() function to get a supercharged instance of Puppeteer.
 * - Puppeteer to control headless Chrome browser.
 * - Apify.call() to invoke another actor with a provided input.
 */

const Apify = require('apify');

const YOUR_MAIL = 'john.doe@example.com';

Apify.main(async () => {
    // Start browser.
    const browser = await Apify.launchPuppeteer({ headless: true });

    // Load Kraken and get last traded price of BTC.
    const page = await browser.newPage();
    await page.goto('https://www.kraken.com/charts');
    const tradedPricesHtml = await page.$eval('#ticker-top ul', el => el.outerHTML);

    console.log('Calling another actor. This may take a few seconds...');
    // Send prices to your email. For that, you can use an actor we already
    // have available on the platform under the name: apify/send-mail.
    // The second parameter to the Apify.call() invocation is the actor's
    // desired input. You can find the required input parameters by checking
    // the actor's documentation page: https://www.apify.com/apify/send-mail
    await Apify.call('apify/send-mail', {
        to: YOUR_MAIL,
        subject: 'Kraken.com BTC',
        html: `<h1>Kraken.com BTC</h1>${tradedPricesHtml}`,
    });

    console.log('Actor successfully called. Go check your email.');
});
