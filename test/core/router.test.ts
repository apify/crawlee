import { MissingRouteError, Router } from '@crawlee/core';
import { BasicCrawler } from '@crawlee/basic';

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
            'label A handled with url https://example.com/A',
            'label A handled with url https://example.com/A',
            'label C handled with url https://example.com/C',
            'label A handled with url https://example.com/A',
            'label B handled with url https://example.com/B',
            'label B handled with url https://example.com/B',
            'default handled with url https://example.com/',
            'label A handled with url https://example.com/A',
            'label C handled with url https://example.com/C',
            'label C handled with url https://example.com/C',
            'default handled with url https://example.com/D',
            'label C handled with url https://example.com/C',
        ]);
    });

    test('validation', async () => {
        const router = Router.create();
        router.addHandler('A', async (ctx) => {});
        expect(() => router.addHandler('A', async (ctx) => {})).toThrow();
        const log = { info: jest.fn(), warn: jest.fn(), debug: jest.fn() };
        expect(() => router({ request: { loadedUrl: 'https://example.com/C', label: 'C' }, log } as any)).toThrow(MissingRouteError);
        router.addDefaultHandler(async (ctx) => {});
        expect(() => router.addDefaultHandler(async (ctx) => {})).toThrow();
    });

    test('assignability to requestHandler', async () => {
        const router = Router.create();
        const crawler = new BasicCrawler({
            requestHandler: router,
        });
    });
});
