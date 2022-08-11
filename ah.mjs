import playwright from 'playwright';
import { PlaywrightCrawler, ProxyConfiguration } from './packages/playwright-crawler/dist/index.mjs';

const proxyConfiguration = new ProxyConfiguration({
    proxyUrls: [
        'http://auto:apify_proxy_c99aFYWYkUngbNHz9pEH6nwPLs5T9s2jW2KN@proxy.apify.com:8000',
    ],
});

const crawler = new PlaywrightCrawler({
	proxyConfiguration,

	launchContext: {
		launchOptions: {
			headless: false,
		},
        launcher: playwright.firefox,
		experimentalContainers: true,
		// useIncognitoPages: true, // do not uncomment this
	},

	async requestHandler({ request, page, log }) {
		const result = await page.content();
		// const extracted = result.slice(result.indexOf('{'), result.lastIndexOf('}') + 1);
		// const { origin } = JSON.parse(extracted);

		// log.info(origin);

        await new Promise(resolve => setTimeout(resolve, 1000));

		log.info(`Processing ${request.url}...`);
	},

	failedRequestHandler({ request, log }) {
		log.info(`Request ${request.url} failed too many times.`);
	},
});

const urls = [];

for (let i = 0; i < 2; i++) {
    urls.push('https://amazon.com/?' + Math.random());
}

await crawler.run(urls);
