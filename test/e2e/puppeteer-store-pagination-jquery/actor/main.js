import http from 'node:http';

import { Actor } from 'apify';
import { Dataset, PuppeteerCrawler } from '@crawlee/puppeteer';

// Self-contained fixture: three paginated listing pages, each linking to
// product detail pages, using the class names the crawler selects on.
const PAGE_SIZE = 6;
const PAGE_COUNT = 3;
const MANUFACTURERS = ['sony', 'denon', 'sennheiser', 'yamaha', 'pioneer', 'klipsch'];

const products = Array.from({ length: PAGE_SIZE * PAGE_COUNT }, (_, i) => ({
    slug: `${MANUFACTURERS[i % MANUFACTURERS.length]}-model-${i + 1}`,
    title: `Model ${i + 1}`,
    sku: `SKU-${100 + i}`,
    // Thousands separator so the handler's comma stripping is exercised.
    price: `$${(1000 + i * 10).toLocaleString('en-US')}.00`,
    inStock: i % 3 !== 0,
}));

const listingPage = (pageNo) => `<!doctype html>
<html><head><title>All TVs, page ${pageNo}</title></head>
<body>
    ${products
        .slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE)
        .map((p) => `<a class="product-item__image-wrapper" href="/products/${p.slug}">${p.title}</a>`)
        .join('\n    ')}
    ${pageNo < PAGE_COUNT ? `<a class="pagination__next" href="/collections/all-tvs?page=${pageNo + 1}">Next</a>` : ''}
</body></html>`;

const detailPage = (product) => `<!doctype html>
<html><head><title>${product.title}</title></head>
<body>
    <div class="product-meta"><h1>${product.title}</h1></div>
    <span class="product-meta__sku-number">${product.sku}</span>
    <span class="price">${product.price}</span>
    <span class="price">Regular price</span>
    <span class="product-form__inventory">${product.inStock ? 'In stock' : 'Out of stock'}</span>
</body></html>`;

const server = http.createServer((req, res) => {
    const { pathname, searchParams } = new URL(req.url, 'http://127.0.0.1');
    let body;

    if (pathname === '/collections/all-tvs') {
        const pageNo = Number(searchParams.get('page') ?? 1);
        if (pageNo >= 1 && pageNo <= PAGE_COUNT) body = listingPage(pageNo);
    } else if (pathname.startsWith('/products/')) {
        const product = products.find((p) => p.slug === pathname.slice('/products/'.length));
        if (product) body = detailPage(product);
    }

    if (body === undefined) {
        res.statusCode = 404;
        res.end('Not Found');
        return;
    }

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

const mainOptions = {
    exit: Actor.isAtHome(),
    storage:
        process.env.STORAGE_IMPLEMENTATION === 'LOCAL'
            ? new (await import('@apify/storage-local')).ApifyStorageLocal()
            : undefined,
};

await Actor.main(async () => {
    const crawler = new PuppeteerCrawler({
        maxRequestsPerCrawl: 10,
        preNavigationHooks: [
            async ({ page, gotoOptions }) => {
                await page.evaluateOnNewDocument(() => {
                    localStorage.setItem('themeExitPopup', 'true');
                });
                gotoOptions.waitUntil = ['networkidle2'];
            },
        ],
        async requestHandler({ page, request, log, enqueueLinks, injectJQuery }) {
            const {
                url,
                userData: { label },
            } = request;

            if (label === 'START') {
                log.info('Store opened');
                const nextButtonSelector = '.pagination__next';
                // enqueue product details from the first two pages of the store
                for (let pageNo = 1; pageNo < 3; pageNo++) {
                    // Wait for network events to finish
                    await page.waitForNetworkIdle({ concurrency: 2 });
                    // Enqueue all loaded links
                    await enqueueLinks({
                        selector: 'a.product-item__image-wrapper',
                        label: 'DETAIL',
                        include: [`${baseUrl}/*/*`],
                    });
                    log.info(`Enqueued actors for page ${pageNo}`);
                    log.info('Loading the next page');
                    await page.evaluate((el) => document.querySelector(el)?.click(), nextButtonSelector);
                }
            } else if (label === 'DETAIL') {
                log.info(`Scraping ${url}`);
                await injectJQuery();
                const urlPart = url.split('/').slice(-1); // ['sony-model-1']
                const manufacturer = urlPart[0].split('-')[0]; // 'sony'

                /* eslint-disable no-undef */
                const results = await page.evaluate(() => {
                    const rawPrice = $('span.price')
                        .filter((_, el) => $(el).text().includes('$'))
                        .first()
                        .text()
                        .split('$')[1];

                    const price = Number(rawPrice.replaceAll(',', ''));

                    const inStock =
                        $('span.product-form__inventory')
                            .first()
                            .filter((_, el) => $(el).text().includes('In stock')).length !== 0;

                    return {
                        title: $('.product-meta h1').text(),
                        sku: $('span.product-meta__sku-number').text(),
                        currentPrice: price,
                        availableInStock: inStock,
                    };
                });

                /* eslint-enable no-undef */

                await Dataset.pushData({ url, manufacturer, ...results });
            }
        },
    });

    await crawler.run([{ url: `${baseUrl}/collections/all-tvs`, userData: { label: 'START' } }]);
}, mainOptions);

server.close();
