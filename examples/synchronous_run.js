/**
 * This example shows shows a quick actor that has a run time of just a few seconds.
 * It opens a [web page](http://goldengatebridge75.org/news/webcam.html) that contains webcam stream from the Golden Gate
 * Bridge, takes a screenshot of the page and saves it as output.
 *
 * This actor
 * can be invoked synchronously using a single HTTP request to directly obtain its output as a reponse,
 * using the [Run actor synchronously](https://www.apify.com/docs/api/v2#/reference/actors/run-actor-synchronously/without-input)
 * Apify API endpoint.
 * The example is also shared as the [apify/example-golden-gate-webcam](https://www.apify.com/apify/example-golden-gate-webcam)
 * actor in the Apify library, so you can test it directly there simply by sending a POST request to
 * https://api.apify.com/v2/acts/apify~example-golden-gate-webcam/run-sync?token=[YOUR_API_TOKEN]
 */

const Apify = require('apify');

Apify.main(async () => {
    // Launch web browser.
    const browser = await Apify.launchPuppeteer();

    // Load http://goldengatebridge75.org/news/webcam.html and get an IFRAME with the webcam stream
    console.log('Opening web page...');
    const page = await browser.newPage();
    await page.goto('http://goldengatebridge75.org/news/webcam.html');
    const iframe = (await page.frames()).pop();

    // Get webcam image element handle.
    const imageElementHandle = await iframe.$('.VideoColm img');

    // Give the webcam image some time to load.
    console.log('Waiting for page to load...');
    await Apify.utils.sleep(3000);

    // Get a screenshot of that image.
    const imageBuffer = await imageElementHandle.screenshot();
    console.log('Screenshot captured.');

    // Save the screenshot as the actor's output. By convention, similarly to "INPUT",
    // the actor's output is stored in the default key-value store under the "OUTPUT" key.
    await Apify.setValue('OUTPUT', imageBuffer, { contentType: 'image/jpeg' });
    console.log('Actor finished.');
});
