import { BasicCrawler } from '@crawlee/basic';
import type { CrawlingContext } from '@crawlee/core';
import { MissingRouteError, Router } from '@crawlee/core';

describe('Router', () => {
    test('should be callable and route based on the label', async () => {
        const router = Router.create();

        const logs: string[] = [];
        router.addHandler('A', async (ctx) => {
            logs.push(`label A handled with url ${ctx.request.loadedUrl}`);
        });
        router.addHandler('B', async (ctx) => {
            logs.push(`label B handled with url ${ctx.request.loadedUrl}`);
        });
        router.addHandler('C', async (ctx) => {
            logs.push(`label C handled with url ${ctx.request.loadedUrl}`);
        });
        router.addDefaultHandler(async (ctx) => {
            logs.push(`default handled with url ${ctx.request.loadedUrl}`);
        });
        router.use(({ request }) => void logs.push(`middleware 1: ${request.loadedUrl}`));
        router.use(({ request }) => void logs.push(`middleware 2: ${request.loadedUrl}`));
        router.use(({ request }) => void logs.push(`middleware 3: ${request.loadedUrl}`));

        const log = { info: jest.fn(), warn: jest.fn(), debug: jest.fn() };
        await router({ request: { loadedUrl: 'https://example.com/A', label: 'A' }, log } as any);
        await router({ request: { loadedUrl: 'https://example.com/A', label: 'A' }, log } as any);
        await router({ request: { loadedUrl: 'https://example.com/C', label: 'C' }, log } as any);
        await router({ request: { loadedUrl: 'https://example.com/A', label: 'A' }, log } as any);
        await router({ request: { loadedUrl: 'https://example.com/B', label: 'B' }, log } as any);
        await router({ request: { loadedUrl: 'https://example.com/B', label: 'B' }, log } as any);
        await router({ request: { loadedUrl: 'https://example.com/' }, log } as any);
        await router({ request: { loadedUrl: 'https://example.com/A', label: 'A' }, log } as any);
        await router({ request: { loadedUrl: 'https://example.com/C', label: 'C' }, log } as any);
        await router({ request: { loadedUrl: 'https://example.com/C', label: 'C' }, log } as any);
        await router({ request: { loadedUrl: 'https://example.com/D', label: 'D' }, log } as any);
        await router({ request: { loadedUrl: 'https://example.com/C', label: 'C' }, log } as any);

        expect(logs).toEqual([
            'middleware 1: https://example.com/A',
            'middleware 2: https://example.com/A',
            'middleware 3: https://example.com/A',
            'label A handled with url https://example.com/A',
            'middleware 1: https://example.com/A',
            'middleware 2: https://example.com/A',
            'middleware 3: https://example.com/A',
            'label A handled with url https://example.com/A',
            'middleware 1: https://example.com/C',
            'middleware 2: https://example.com/C',
            'middleware 3: https://example.com/C',
            'label C handled with url https://example.com/C',
            'middleware 1: https://example.com/A',
            'middleware 2: https://example.com/A',
            'middleware 3: https://example.com/A',
            'label A handled with url https://example.com/A',
            'middleware 1: https://example.com/B',
            'middleware 2: https://example.com/B',
            'middleware 3: https://example.com/B',
            'label B handled with url https://example.com/B',
            'middleware 1: https://example.com/B',
            'middleware 2: https://example.com/B',
            'middleware 3: https://example.com/B',
            'label B handled with url https://example.com/B',
            'middleware 1: https://example.com/',
            'middleware 2: https://example.com/',
            'middleware 3: https://example.com/',
            'default handled with url https://example.com/',
            'middleware 1: https://example.com/A',
            'middleware 2: https://example.com/A',
            'middleware 3: https://example.com/A',
            'label A handled with url https://example.com/A',
            'middleware 1: https://example.com/C',
            'middleware 2: https://example.com/C',
            'middleware 3: https://example.com/C',
            'label C handled with url https://example.com/C',
            'middleware 1: https://example.com/C',
            'middleware 2: https://example.com/C',
            'middleware 3: https://example.com/C',
            'label C handled with url https://example.com/C',
            'middleware 1: https://example.com/D',
            'middleware 2: https://example.com/D',
            'middleware 3: https://example.com/D',
            'default handled with url https://example.com/D',
            'middleware 1: https://example.com/C',
            'middleware 2: https://example.com/C',
            'middleware 3: https://example.com/C',
            'label C handled with url https://example.com/C',
        ]);
    });

    test('should be possible to define routes when creating router', async () => {
        const logs: string[] = [];
        // it should be possible to define router inline when creating router
        const router = Router.create({
            'A': async (ctx) => {
                logs.push(`label A handled with url ${ctx.request.loadedUrl}`);
            },
            'B': async (ctx) => {
                logs.push(`label B handled with url ${ctx.request.loadedUrl}`);
            },
        });
        // and it's still possible to attach handlers later
        router.addHandler('C', async (ctx) => {
            logs.push(`label C handled with url ${ctx.request.loadedUrl}`);
        });
        router.addDefaultHandler(async (ctx) => {
            logs.push(`default handled with url ${ctx.request.loadedUrl}`);
        });
        const log = { info: jest.fn(), warn: jest.fn(), debug: jest.fn() };
        await router({ request: { loadedUrl: 'https://example.com/A', label: 'A' }, log } as any);
        await router({ request: { loadedUrl: 'https://example.com/B', label: 'B' }, log } as any);
        await router({ request: { loadedUrl: 'https://example.com/C', label: 'C' }, log } as any);
        await router({ request: { loadedUrl: 'https://example.com/' }, log } as any);

        expect(logs).toEqual([
            'label A handled with url https://example.com/A',
            'label B handled with url https://example.com/B',
            'label C handled with url https://example.com/C',
            'default handled with url https://example.com/',
        ]);
    });

    test('validation', async () => {
        const router = Router.create();
        router.addHandler('A', async (ctx) => {});
        expect(() => router.addHandler('A', async (ctx) => {})).toThrow();
        const log = { info: jest.fn(), warn: jest.fn(), debug: jest.fn() };
        await expect(router({ request: { loadedUrl: 'https://example.com/C', label: 'C' }, log } as any)).rejects.toThrow(MissingRouteError);
        router.addDefaultHandler(async (ctx) => {});
        expect(() => router.addDefaultHandler(async (ctx) => {})).toThrow();
    });

    test('assignability to requestHandler', async () => {
        const router = Router.create();
        const crawler = new BasicCrawler({
            requestHandler: router,
        });
    });

    test('addHandler accepts userdata generic', async () => {
        const testType = <T>(t: T): void => {};

        const router: Router<CrawlingContext<{foo: 'foo'}>> = {
            addHandler: () => {},
            addDefaultHandler: () => {},
        } as any;

        router.addHandler('1', (ctx) => {
            testType<'foo'>(ctx.request.userData.foo);
        });

        router.addHandler<{foo: 'bar'}>('2', (ctx) => {
            testType<'bar'>(ctx.request.userData.foo);
        });

        router.addDefaultHandler((ctx) => {
            testType<'foo'>(ctx.request.userData.foo);
        });

        router.addDefaultHandler<{foo: 'bar'}>((ctx) => {
            testType<'bar'>(ctx.request.userData.foo);
        });
    });
});
