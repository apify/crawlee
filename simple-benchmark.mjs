import { performance } from 'perf_hooks';
import { JSDOMCrawler } from './packages/jsdom-crawler/dist/index.mjs';
import { LinkeDOMCrawler } from './packages/linkedom-crawler/dist/index.mjs';
import { CheerioCrawler } from './packages/cheerio-crawler/dist/index.mjs';
import { HttpCrawler } from './packages/http-crawler/dist/index.mjs';
import { MemoryStorage } from './packages/memory-storage/dist/index.mjs'
import { Configuration, StorageManager } from "./packages/core/dist/index.mjs";
import { resolve } from 'node:path';
import { ensureDir } from 'fs-extra';
import { cryptoRandomObjectId } from '@apify/utilities';
import fs from 'node:fs';

const urls = [
    'https://crawlee.dev',
    'https://crawlee.dev/docs/examples',
    'https://crawlee.dev/docs/introduction',
    'https://crawlee.dev/docs/guides',
    'https://crawlee.dev/docs/quick-start',
    'https://crawlee.dev/api/core',
    'https://crawlee.dev/docs/introduction/setting-up',
    'https://crawlee.dev/docs/upgrading/upgrading-to-v3',
    'https://crawlee.dev/docs/introduction/first-crawler',
    'https://crawlee.dev/docs/introduction/crawling',
    'https://crawlee.dev/docs/introduction/saving-data',
    'https://crawlee.dev/docs/introduction/scraping',
    'https://crawlee.dev/api/core/changelog',
    'https://crawlee.dev/docs/introduction/adding-urls',
    'https://crawlee.dev/docs/examples/accept-user-input',
    'https://crawlee.dev/docs/examples/add-data-to-dataset',
    'https://crawlee.dev/docs/introduction/refactoring',
    'https://crawlee.dev/docs/examples/basic-crawler',
    'https://crawlee.dev/docs/examples/cheerio-crawler',
    'https://crawlee.dev/docs/examples/crawl-all-links',
    'https://crawlee.dev/docs/examples/crawl-multiple-urls',
    'https://crawlee.dev/docs/introduction/real-world-project',
    'https://crawlee.dev/docs/examples/crawl-single-url',
    'https://crawlee.dev/docs/examples/crawl-sitemap',
    'https://crawlee.dev/docs/examples/crawl-some-links',
    'https://crawlee.dev/docs/examples/forms',
    'https://crawlee.dev/docs/examples/http-crawler',
    'https://crawlee.dev/docs/examples/crawl-relative-links',
    'https://crawlee.dev/docs/examples/map-and-reduce',
    'https://crawlee.dev/docs/examples/playwright-crawler',
    'https://crawlee.dev/docs/examples/puppeteer-crawler',
    'https://crawlee.dev/docs/examples/capture-screenshot',
    'https://crawlee.dev/docs/examples/puppeteer-recursive-crawl',
    'https://crawlee.dev/docs/examples/puppeteer-with-proxy',
    'https://crawlee.dev/docs/upgrading',
    'https://crawlee.dev/docs/examples/skip-navigation',
    'https://crawlee.dev/docs/guides/apify-platform',
    'https://crawlee.dev/docs/guides/request-storage',
    'https://crawlee.dev/docs/guides/cheerio-crawler-guide',
    'https://crawlee.dev/docs/guides/configuration',
    'https://crawlee.dev/docs/guides/javascript-rendering',
    'https://crawlee.dev/docs/guides/scaling-crawlers',
    'https://crawlee.dev/docs/guides/avoid-blocking',
    'https://crawlee.dev/docs/guides/proxy-management',
    'https://crawlee.dev/docs/guides/session-management',
    'https://crawlee.dev/docs/guides/got-scraping',
    'https://crawlee.dev/docs/guides/typescript-project',
    'https://crawlee.dev/docs/guides/docker-images',
    'https://crawlee.dev/docs/guides/result-storage',
    'https://crawlee.dev/api/cheerio-crawler/class/CheerioCrawler',
    'https://crawlee.dev/api/core/class/AutoscaledPool',
    'https://crawlee.dev/api/puppeteer-crawler/class/PuppeteerCrawler',
    'https://crawlee.dev/api/playwright-crawler/class/PlaywrightCrawler',
    'https://crawlee.dev/api/core/function/enqueueLinks',
    'https://crawlee.dev/api/core/enum/EnqueueStrategy',
    'https://crawlee.dev/api/core/interface/AutoscaledPoolOptions',
    'https://crawlee.dev/api/cheerio-crawler',
    'https://crawlee.dev/api/basic-crawler',
    'https://crawlee.dev/api/playwright-crawler',
    'https://crawlee.dev/api/http-crawler',
    'https://crawlee.dev/api/memory-storage',
    'https://crawlee.dev/api/utils',
    'https://crawlee.dev/api/types',
    'https://crawlee.dev/api/puppeteer-crawler',
    'https://crawlee.dev/api/browser-crawler',
    'https://crawlee.dev/api/browser-pool',
    'https://crawlee.dev/api/core/class/Configuration',
    'https://crawlee.dev/api/core/class/CriticalError',
    'https://crawlee.dev/api/core/class/EventManager',
    'https://crawlee.dev/api/core/class/LocalEventManager',
    'https://crawlee.dev/api/core/class/Log',
    'https://crawlee.dev/api/core/class/Router',
    'https://crawlee.dev/api/core/class/NonRetryableError',
    'https://crawlee.dev/api/core/class/Logger',
    'https://crawlee.dev/api/core/class/Statistics',
    'https://crawlee.dev/api/core/class/LoggerJson',
    'https://crawlee.dev/api/core/class/ProxyConfiguration',
    'https://crawlee.dev/api/core/class/Dataset',
    'https://crawlee.dev/api/core/class/Session',
    'https://crawlee.dev/api/core/class/LoggerText',
    'https://crawlee.dev/api/core/class/SystemStatus',
    'https://crawlee.dev/api/core/class/PseudoUrl',
    'https://crawlee.dev/api/core/class/Request',
    'https://crawlee.dev/api/core/class/RequestList',
    'https://crawlee.dev/api/core/class/Snapshotter',
    'https://crawlee.dev/api/core/enum/EventType',
    'https://crawlee.dev/api/core/class/KeyValueStore',
    'https://crawlee.dev/api/core/enum/LogLevel',
    'https://crawlee.dev/api/core/function/purgeDefaultStorages',
    'https://crawlee.dev/api/core/interface/ClientInfo',
    'https://crawlee.dev/api/core/class/RequestQueue',
    'https://crawlee.dev/api/core/interface/ConfigurationOptions',
    'https://crawlee.dev/api/core/interface/CreateSession',
    'https://crawlee.dev/api/core/interface/CrawlingContext',
    'https://crawlee.dev/api/core/interface/DatasetConsumer',
    'https://crawlee.dev/api/core/interface/DatasetContent',
    'https://crawlee.dev/api/core/class/SessionPool',
    'https://crawlee.dev/api/core/interface/DatasetIteratorOptions',
    'https://crawlee.dev/api/core/interface/DatasetMapper',
    'https://crawlee.dev/api/core/interface/DatasetOptions',
];

async function prep() {
    StorageManager.clearCache()
    const localStorageDir = resolve(resolve(process.cwd(), '..', 'tmp', 'memory-emulation-dir'), cryptoRandomObjectId(10));
    await ensureDir(localStorageDir);
    Configuration.getGlobalConfig().useStorageClient(new MemoryStorage({ localDataDirectory: localStorageDir, persistStorage: false, writeMetadata: false }));
    console.log(`Initialized emulated memory storage in folder ${localStorageDir}`)
}

const suite = {
    JSDOMCrawler: () => new JSDOMCrawler({
        maxRequestRetries: 0,
        requestHandler: async ({ request, window, enqueueLinks }) => {
            console.log(Math.round(performance.now() / 1000), window.document.title, request.url);
            await enqueueLinks();
        }
    }),
    LinkeDOMCrawler: () => new LinkeDOMCrawler({
        maxRequestRetries: 0,
        requestHandler: async ({ request, window, enqueueLinks }) => {
            console.log(Math.round(performance.now() / 1000), window.document.title, request.url);
            await enqueueLinks();
        },
    }),
    CheerioCrawler: () => new CheerioCrawler({
        maxRequestRetries: 0,
        requestHandler: async ({ request, $, enqueueLinks }) => {
            console.log(Math.round(performance.now() / 1000), $('title').text(), request.url);
            await enqueueLinks();
        },
    }),
    HttpCrawler: () => new HttpCrawler({
        maxRequestRetries: 0,
        requestHandler: async ({ request, body }) => {
            console.log(Math.round(performance.now() / 1000), body.toString().match(/<title(?:.*?)>(.*?)<\/title>/)?.[1], request.url);
        },
    }),
}


for (const [name, crawler] of Object.entries(suite)) {
    await prep();
    console.log(`${name} >> Starting`);
    const startTime = performance.now();
    const crawlerInstance = crawler();
    const { requestsFinished, requestsTotal } = await crawlerInstance.run(urls);
    const endTime = performance.now();
    const seconds = Math.round((endTime - startTime) / 1000);
    console.log(`${name} >> Finished in ${seconds} seconds, ${requestsFinished} requests finished, ${requestsTotal} requests total`);
    fs.appendFileSync('simple-benchmark-results.csv', `${name},${seconds},${requestsFinished},${requestsTotal}`);
    await new Promise(resolve => setTimeout(resolve, 1000)); // wait for 1s, just to be sure
}


