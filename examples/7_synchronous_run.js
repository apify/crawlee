/**
 * This example shows shows an actor that has short runtime - just few seconds. It opens a webpage
 * http://goldengatebridge75.org/news/webcam.html that contains webcam stream from Golden Gate
 * bridge, takes a screenshot and saves it as output. This makes actor executable on Apify platform
 * synchronously with a single request that also returns its output.
 *
 * Example is shared in library under https://www.apify.com/apify/example-golden-gate-webcam
 * so you can easily run it with request to
 * https://api.apify.com/v2/acts/apify~example-golden-gate-webcam/run-sync?token=[YOUR_API_TOKEN]
 *
 * Example uses:
 * - Apify.launchPuppeteer() function to get a supercharged instance of Puppeteer.
 * - Puppeteer to control headless Chrome browser.
 * - Apify KeyValueStore to store data and provide an API response.
 */

const Apify = require('apify');

Apify.main(async () => {
    // Start browser.
    const browser = await Apify.launchPuppeteer({ headless: true });

    // Load http://goldengatebridge75.org/news/webcam.html and get an iframe
    // containing webcam stream.
    console.log('Opening page.');
    const page = await browser.newPage();
    await page.goto('http://goldengatebridge75.org/news/webcam.html');
    const iframe = (await page.frames()).pop();

    // Get webcam image element handle.
    const imageElementHandle = await iframe.$('.VideoColm img');

    // Give the webcam image some time to load.
    console.log('Waiting for some time...');
    await Apify.utils.sleep(3000);

    // Get a screenshot of that image.
    const imageBuffer = await imageElementHandle.screenshot();
    console.log('Screenshot captured.');

    // Save it as an OUTPUT. Just as INPUT, OUTPUT has a special meaning.
    // Anything you save as an OUTPUT to KeyValueStore will be sent to you
    // as an API response once the actor finishes its run, if you use the
    // run-sync API. This way, you can really Apify any website.
    await Apify.setValue('OUTPUT', imageBuffer, { contentType: 'image/jpeg' });
    console.log('Actor finished.');
});
