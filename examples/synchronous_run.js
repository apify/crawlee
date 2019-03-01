/**
 * This example shows a quick actor that has a run time of just a few seconds.
 * It opens a <a href="http://goldengatebridge75.org/news/webcam.html" target="_blank">web page</a>
 * that contains a webcam stream from the Golden Gate Bridge, takes a screenshot of the page and saves it as output.
 *
 * This actor
 * can be invoked synchronously using a single HTTP request to directly obtain its output as a reponse, using the
 * <a href="https://apify.com/docs/api/v2#/reference/actors/run-actor-synchronously/without-input" target="_blank">Run actor synchronously</a>
 * Apify API endpoint. The example is also shared as the
 * <a href="https://apify.com/apify/example-golden-gate-webcam" target="_blank">apify/example-golden-gate-webcam</a>
 * actor in the Apify library, so you can test it directly there simply by sending a POST request to
 * ```http
 * https://api.apify.com/v2/acts/apify~example-golden-gate-webcam/run-sync?token=[YOUR_API_TOKEN]
 * ```
 *
 * To run this example on the Apify Platform, select the `Node.js 8 + Chrome on Debian (apify/actor-node-chrome)` base image
 * on the source tab of your actor configuration.
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
