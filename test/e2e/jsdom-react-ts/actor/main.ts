import { Actor } from 'apify';
import { JSDOMCrawler, Dataset } from '@crawlee/jsdom';

if (process.env.STORAGE_IMPLEMENTATION === 'LOCAL') {
    await Actor.init({ storage: new (await import('@apify/storage-local')).ApifyStorageLocal() });
} else {
    await Actor.init();
}

const crawler = new JSDOMCrawler({
    runScripts: true,
    requestHandler: async ({ window }) => {
        const { document } = window;
        document.querySelectorAll('button')[12].click(); // 1
        document.querySelectorAll('button')[15].click(); // +
        document.querySelectorAll('button')[12].click(); // 1
        document.querySelectorAll('button')[18].click(); // =

        // 2
        const { innerHTML } = document.querySelectorAll('.component-display')[0].childNodes[0] as Element;

        await Dataset.pushData({ result: innerHTML });
    },
});

await crawler.run([
    'https://ahfarmer.github.io/calculator/',
]);

await Actor.exit({ exit: Actor.isAtHome() });
