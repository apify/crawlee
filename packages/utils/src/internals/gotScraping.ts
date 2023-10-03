// @ts-expect-error This throws a compilation error due to got-scraping being ESM only but we only import types, so its alllll gooooood
import type { GotScraping } from 'got-scraping';

// eslint-disable-next-line import/no-mutable-exports -- Borrowing a book from NodeJS's code, we override the method with the imported one once the method is called
let gotScraping = (async (...args: Parameters<GotScraping>) => {
    ({ gotScraping } = await import('got-scraping'));

    return gotScraping(...args);
}) as GotScraping;

export { gotScraping };
