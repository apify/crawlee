/**
 * This example shows how to call another act - in this case apify/send-main to send
 * email.
 *
 * BTC is falling down for few months already. If you don't want to miss the chance of
 * of your live then you can use this code to get current BTC prices from Kraken.com
 * and mail them to your mailbox.
 *
 * If you deploy this act to Apify platform then you can setup a scheduler for early
 * morning.
 */

const Apify = require('apify');

const YOUR_MAIL = 'john.doe@example.com';

Apify.main(async () => {
    // Start browser.
    const browser = await Apify.launchPuppeteer();

    // Load Kraken and get last traded price of BTC.
    const page = await browser.newPage();
    await page.goto('https://www.kraken.com/charts');
    const tradedPricesHtml = await page.$eval('#ticker-top ul', el => el.outerHTML);

    // Send prices to your email.
    await Apify.call('apify/send-mail', {
        to: YOUR_MAIL,
        subject: 'Kraken.com BTC',
        html: `<h1>Kraken.com BTC</h1>${tradedPricesHtml}`,
    });
});
