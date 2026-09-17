import { CheerioCrawler } from '@crawlee/cheerio';
import { MemoryStorageBackend, serviceLocator } from '@crawlee/core';

import log from '@apify/log';

log.setLevel(log.LEVELS.OFF);
serviceLocator.setStorageBackend(new MemoryStorageBackend());

const crawler = new CheerioCrawler({
    maxRequestRetries: 0,
    requestHandler: async () => {},
});

await crawler.run([process.env.CRAWLEE_OTEL_SMOKE_URL!]);
