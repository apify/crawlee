import { expect } from 'chai';
import Apify from '../build/index';

const { addInterceptRequestHandler, removeInterceptRequestHandler } = Apify.utils.puppeteer;

// Simple page with image, script and stylesheet links.
const HTML_PAGE = `<html><body>
    <link rel="stylesheet" type="text/css" href="https://example.com/style.css">
    <img src="https://example.com/image.png" />
    <script src="https://example.com/script.js" defer="defer">></script>
</body></html>`;

describe('Apify.utils.puppeteer.addInterceptRequestHandler|removeInterceptRequestHandler()', () => {
    it('should allow multiple handlers', async () => {
        const browser = await Apify.launchPuppeteer({ headless: true });

        const allUrls = [];
        const loadedUrls = [];

        try {
            const page = await browser.newPage();

            // Just collect all URLs.
            await addInterceptRequestHandler(page, (request) => {
                allUrls.push(request.url());
                return request.continue();
            });

            // Abort images.
            await addInterceptRequestHandler(page, (request) => {
                if (request.resourceType() === 'image') return request.abort();
                return request.continue();
            });

            // Abort scripts.
            await addInterceptRequestHandler(page, (request) => {
                if (request.resourceType() === 'script') return request.abort();
                return request.continue();
            });

            // Save all loaded URLs.
            page.on('response', response => loadedUrls.push(response.url()));

            await page.setContent(HTML_PAGE, { waitUntil: 'networkidle0' });
        } finally {
            await browser.close();
        }

        expect(allUrls).to.have.members([
            'https://example.com/script.js',
            'https://example.com/style.css',
            'https://example.com/image.png',
        ]);

        expect(loadedUrls).to.have.members([
            'https://example.com/style.css',
        ]);
    });

    it('should not propagate aborted/responded requests to following handlers', async () => {
        const browser = await Apify.launchPuppeteer({ headless: true });
        const propagatedUrls = [];

        try {
            const page = await browser.newPage();

            // Abort images.
            await addInterceptRequestHandler(page, (request) => {
                if (request.resourceType() === 'image') return request.abort();
                return request.continue();
            });

            // Respond scripts.
            await addInterceptRequestHandler(page, (request) => {
                if (request.resourceType() === 'script') {
                    return request.respond({
                        status: 404,
                    });
                }
                return request.continue();
            });

            // Just collect all URLs propagated to the last handler.
            await addInterceptRequestHandler(page, (request) => {
                propagatedUrls.push(request.url());
                return request.continue();
            });
            await page.setContent(HTML_PAGE, { waitUntil: 'networkidle0' });
        } finally {
            await browser.close();
        }

        expect(propagatedUrls).to.have.members([
            'https://example.com/style.css',
        ]);
    });

    it('should allow to modify request', async () => {
        const browser = await Apify.launchPuppeteer({ headless: true });

        try {
            const page = await browser.newPage();

            // Change all requests to DELETE.
            await addInterceptRequestHandler(page, (request) => {
                return request.continue({ method: 'DELETE' });
            });
            // Add some query parameters to request URLs.
            await addInterceptRequestHandler(page, (request) => {
                return request.continue({
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                    },
                    postData: '{ "foo": "bar" }',
                });
            });
            // Change all requests to POST and add payload.
            await addInterceptRequestHandler(page, (request) => {
                return request.continue({
                    method: 'POST',
                });
            });

            // Check response that it's correct.
            const response = await page.goto('https://api.apify.com/v2/browser-info', { waitUntil: 'networkidle0' });
            const { method, headers, bodyLength } = JSON.parse(await response.text());
            expect(method).to.be.eql('POST');
            expect(bodyLength).to.be.eql(16);
            expect(headers['content-type']).to.be.eql('application/json; charset=utf-8');
        } finally {
            await browser.close();
        }
    });
});

describe('Apify.utils.puppeteer.removeInterceptRequestHandler()', () => {
    it('works', async () => {
        const browser = await Apify.launchPuppeteer({ headless: true });

        const loadedUrls = [];

        try {
            const page = await browser.newPage();
            page.on('response', response => loadedUrls.push(response.url()));

            // Abort images.
            const abortImagesHandler = (request) => {
                if (request.resourceType() === 'image') return request.abort();
                return request.continue();
            };
            await addInterceptRequestHandler(page, abortImagesHandler);

            // Abort scripts.
            await addInterceptRequestHandler(page, (request) => {
                if (request.resourceType() === 'script') return request.abort();
                return request.continue();
            });

            // Load with scripts and images disabled.
            await page.setContent('<html><body></body></html>');
            await page.setContent(HTML_PAGE, { waitUntil: 'networkidle0' });
            expect(loadedUrls).to.have.members([
                'https://example.com/style.css',
            ]);

            // Try it once again.
            await page.setContent('<html><body></body></html>');
            await page.setContent(HTML_PAGE, { waitUntil: 'networkidle0' });
            expect(loadedUrls).to.have.members([
                'https://example.com/style.css',
                'https://example.com/style.css',
            ]);

            // Enable images.
            await removeInterceptRequestHandler(page, abortImagesHandler);

            // Try to load once again if images appear there.
            await page.setContent('<html><body></body></html>');
            await page.setContent(HTML_PAGE, { waitUntil: 'networkidle0' });
            expect(loadedUrls).to.have.members([
                'https://example.com/style.css',
                'https://example.com/style.css',
                'https://example.com/style.css',
                'https://example.com/image.png',
            ]);
        } finally {
            await browser.close();
        }
    });
});
