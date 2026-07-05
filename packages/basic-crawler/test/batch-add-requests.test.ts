import { BasicCrawler } from '@crawlee/basic';

import { MemoryStorageClient, serviceLocator, SessionPool } from '@crawlee/core';

describe('BasicCrawler#addRequests with big batch sizes', () => {
    beforeEach(async () => {
        serviceLocator.setStorageClient(new MemoryStorageClient());
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

describe('BasicCrawler - request.sessionId', () => {
    beforeEach(async () => {
        serviceLocator.setStorageClient(new MemoryStorageClient());
    });

    test('uses the session matching request.sessionId from the session pool', async () => {
        const REQUESTED_SESSION_ID = 'my-session';
        let resolvedSessionId: string | undefined;

        const sessionPool = new SessionPool();
        sessionPool.addSession({ id: REQUESTED_SESSION_ID });

        const crawler = new BasicCrawler({
            requestHandler({ session }) {
                resolvedSessionId = session.id;
            },
            sessionPool,
        });

        await crawler.run([{ url: 'http://localhost', sessionId: REQUESTED_SESSION_ID }]);

        expect(resolvedSessionId).toBe('my-session');
    });

    test('throws when request.sessionId is not found in the session pool', async () => {
        const errors: Error[] = [];

        const crawler = new BasicCrawler({
            maxRequestRetries: 0,
            requestHandler() {},
            failedRequestHandler(_ctx, error) {
                errors.push(error);
            },
        });

        await crawler.run([{ url: 'http://localhost', sessionId: 'nonexistent' }]);

        expect(errors).toHaveLength(1);
        expect(errors[0].message).toContain(
            "The current SessionPool instance couldn't find a valid session for the following id: nonexistent",
        );
    });
});
