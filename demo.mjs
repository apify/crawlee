import { performance } from 'perf_hooks';
import { LinkeDOMCrawler } from './packages/linkedom-crawler/dist/index.mjs';
import { CheerioCrawler } from './packages/cheerio-crawler/dist/index.mjs';

const crawler = new LinkeDOMCrawler({
    maxRequestRetries: 0,
    requestHandler: async ({request, window, enqueueLinks}) => {
        console.log(Math.round(performance.now() / 1000), window.document.title, request.url);

        await enqueueLinks();
    },
});

// const crawler = new CheerioCrawler({
//     maxRequestRetries: 0,
//     maxRequestsPerCrawl: 100,
//     requestHandler: async ({request, $, enqueueLinks}) => {
//         console.log(Math.round(performance.now() / 1000), $('title').text(), request.url);

//         await enqueueLinks();
//     },
// });

await crawler.run(['https://crawlee.dev']);
