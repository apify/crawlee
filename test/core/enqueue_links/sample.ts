import { PlaywrightCrawler, Dataset } from 'crawlee';

const crawler = new PlaywrightCrawler({
	async requestHandler(context) {
        console.log(`Processing ${context.request.url}...`);
		await context.enqueueLinks({
			// selector: 'a[href*="/r/legal/"]', // fails
            selector: 'a[slot="full-post-link"]', // fails

			//globs: ['**/comments/**'], // succeeds
			// regexps: [/https:\/\/www\.reddit\.com\/r\/legal\/comments\/.*/],
            // strategy: 'same-domain',
		});
	},
    maxRequestsPerCrawl: 10,
	headless: true,
	launchContext: {
		launchOptions: {
			slowMo: 500,
		},
	},
});

crawler.run(['https://reddit.com/r/legal']); // note: this is missing "www."