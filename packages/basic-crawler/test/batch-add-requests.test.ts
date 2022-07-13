import { BasicCrawler } from '@crawlee/basic';
import { MemoryStorageEmulator } from 'test/shared/MemoryStorageEmulator';

describe('BasicCrawler#addRequests with big batch sizes', () => {
    const localStorageEmulator = new MemoryStorageEmulator();

    beforeEach(async () => {
        await localStorageEmulator.init();
    });

    afterAll(async () => {
        await localStorageEmulator.destroy();
    });

    const requestTemplates = Array.from({ length: 2000 }, (_, i) => ({ url: `https://example.com/${i}` }));

    test('given a chunk of 1000, it should add them and return a fast resolving promise for `waitForAllRequestsToBeAdded`', async () => {
        const crawler = new BasicCrawler({
            requestHandler(ctx) {
                ctx.log.info(`Handled ${ctx.request.url}`);
            },
        });

        const slice = requestTemplates.slice(0, 1000);

        const result = await crawler.addRequests(slice);
        expect(result.addedRequests).toHaveLength(1000);

        const result2 = await result.waitForAllRequestsToBeAdded;
        expect(result2).toHaveLength(0);
    });

    test('given a chunk of 2000, it should add them and return a promise for `waitForAllRequestsToBeAdded` that has 1000 more requests', async () => {
        const crawler = new BasicCrawler({
            requestHandler(ctx) {
                ctx.log.info(`Handled ${ctx.request.url}`);
            },
        });

        const slice = requestTemplates.slice();

        const result = await crawler.addRequests(slice);
        expect(result.addedRequests).toHaveLength(1000);

        const result2 = await result.waitForAllRequestsToBeAdded;
        expect(result2).toHaveLength(1000);
        expect(result.addedRequests).not.toStrictEqual(result2);
    });

    test('given a chunk of 2000, and enabling the `waitForAllRequestsToBeAdded`, it should add all 2000 requests at once', async () => {
        const crawler = new BasicCrawler({
            requestHandler(ctx) {
                ctx.log.info(`Handled ${ctx.request.url}`);
            },
        });

        const slice = requestTemplates.slice();

        const result = await crawler.addRequests(slice, { waitForAllRequestsToBeAdded: true });
        expect(result.addedRequests).toHaveLength(2000);
    });
});
