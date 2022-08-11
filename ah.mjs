import playwright from 'playwright';
import { PlaywrightCrawler, ProxyConfiguration } from './packages/playwright-crawler/dist/index.mjs';

const proxyConfiguration = new ProxyConfiguration({
    proxyUrls: [
        'http://auto:ot4HQbTnKC3rMHpL4LJJWw6ni@proxy.apify.com:8000',
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
		const extracted = result.slice(result.indexOf('{'), result.lastIndexOf('}') + 1);
		const { origin } = JSON.parse(extracted);

		log.info(origin);

		log.info(`Processing ${request.url}...`);
	},

	failedRequestHandler({ request, log }) {
		log.info(`Request ${request.url} failed too many times.`);
	},
});

await crawler.run(['https://httpbin.org/anything?a', 'https://httpbin.org/anything?b']);
