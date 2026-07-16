import { BasicCrawler } from '@crawlee/basic';
import type { CrawlingContext } from '@crawlee/core';
import { defaultRoute, MissingRouteError, Request, RequestValidationError, Router } from '@crawlee/core';
import {
    type CheerioCrawlingContext,
    createCheerioRouter,
    createPlaywrightRouter,
    type PlaywrightCrawlingContext,
} from 'crawlee';
import { z } from 'zod';

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

        const log = { info: vitest.fn(), warn: vitest.fn(), debug: vitest.fn() };
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
        const log = { info: vitest.fn(), warn: vitest.fn(), debug: vitest.fn() };
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
        const log = { info: vitest.fn(), warn: vitest.fn(), debug: vitest.fn() };
        await expect(
            router({ request: { loadedUrl: 'https://example.com/C', label: 'C' }, log } as any),
        ).rejects.toThrow(MissingRouteError);
        router.addDefaultHandler(async (ctx) => {});
        expect(() => router.addDefaultHandler(async (ctx) => {})).toThrow();
    });

    test('assignability to requestHandler', async () => {
        const router = Router.create();
        const crawler = new BasicCrawler({
            requestHandler: router,
        });
    });

    test('context has correct type', async () => {
        const router = createPlaywrightRouter();
        router.addHandler('label', async (ctx: PlaywrightCrawlingContext) => {
            // just to test if this works on type level, the assertion is not actually executed
            expect(ctx.page.$$).toBeDefined();
        });
    });

    test('addHandler accepts userdata generic', async () => {
        const testType = <T>(t: T): void => {};

        const router: Router<CrawlingContext<{ foo: 'foo' }>> = {
            addHandler: () => {},
            addDefaultHandler: () => {},
        } as any;

        router.addHandler('1', (ctx) => {
            testType<'foo'>(ctx.request.userData.foo);
        });

        router.addHandler<{ foo: 'bar' }>('2', (ctx) => {
            testType<'bar'>(ctx.request.userData.foo);
        });

        router.addDefaultHandler((ctx) => {
            testType<'foo'>(ctx.request.userData.foo);
        });

        router.addDefaultHandler<{ foo: 'bar' }>((ctx) => {
            testType<'bar'>(ctx.request.userData.foo);
        });
    });

    test('addHandler infers userData from a declared route map', async () => {
        const testType = <T>(t: T): void => {};

        interface Routes {
            PRODUCT: { sku: string; price: number };
            CATEGORY: { categoryId: string };
        }

        const router: Router<CrawlingContext, Routes> = {
            addHandler: () => {},
            addDefaultHandler: () => {},
        } as any;

        router.addHandler('PRODUCT', (ctx) => {
            testType<string>(ctx.request.userData.sku);
            testType<number>(ctx.request.userData.price);
        });

        router.addHandler('CATEGORY', (ctx) => {
            testType<string>(ctx.request.userData.categoryId);
        });

        // @ts-expect-error unknown labels are rejected when a route map is declared
        router.addHandler('UNKNOWN', () => {});

        router.addDefaultHandler((ctx) => {
            // the default handler is a fallback for any request, so userData stays loosely typed
            testType<Record<string, unknown>>(ctx.request.userData);
        });
    });

    test('factory infers userData from a route map passed as the second type argument', async () => {
        const testType = <T>(t: T): void => {};

        interface Routes {
            PRODUCT: { sku: string; price: number };
            CATEGORY: { categoryId: string };
        }

        // the documented two-argument form: `Routes` is the second type argument of the factory
        const router = createCheerioRouter<CheerioCrawlingContext, Routes>();

        router.addHandler('PRODUCT', (ctx) => {
            testType<string>(ctx.request.userData.sku);
            testType<number>(ctx.request.userData.price);
        });

        router.addHandler('CATEGORY', (ctx) => {
            testType<string>(ctx.request.userData.categoryId);
        });

        // @ts-expect-error unknown labels are rejected when a route map is declared
        router.addHandler('UNKNOWN', () => {});
    });

    test('factory keeps the legacy flat-userData generic working (backwards compatibility)', async () => {
        const testType = <T>(t: T): void => {};

        // a flat `userData` shape (with a scalar field) resolves to the legacy open-map router,
        // so any label is accepted and `userData` is typed as the passed shape
        const router = createCheerioRouter<CheerioCrawlingContext, { token: string }>();

        router.addHandler('anyLabel', (ctx) => {
            testType<string>(ctx.request.userData.token);
        });

        router.addHandler('anotherLabel', (ctx) => {
            testType<string>(ctx.request.userData.token);
        });
    });

    test('schema map infers userData types and validates them at dispatch', async () => {
        const testType = <T>(t: T): void => {};

        const logs: string[] = [];
        const router = createCheerioRouter({
            PRODUCT: z.object({ sku: z.string(), price: z.coerce.number() }),
            CATEGORY: z.object({ categoryId: z.string() }),
        });

        router.addHandler('PRODUCT', async (ctx) => {
            // inferred from the schema (note: price is coerced to a number)
            testType<string>(ctx.request.userData.sku);
            testType<number>(ctx.request.userData.price);
            logs.push(`product ${ctx.request.userData.sku} @ ${ctx.request.userData.price}`);
        });

        // @ts-expect-error unknown labels are still rejected when a schema map is declared
        router.addHandler('UNKNOWN', () => {});

        const log = { info: vitest.fn(), warn: vitest.fn(), debug: vitest.fn() };

        // valid userData passes and is replaced with the parsed (coerced) value
        const validRequest = {
            loadedUrl: 'https://example.com/p',
            label: 'PRODUCT',
            userData: { sku: 'A1', price: '42' },
        };
        await router({ request: validRequest, log } as any);
        expect(logs).toEqual(['product A1 @ 42']);
        expect(validRequest.userData.price).toBe(42);

        // invalid userData throws a RequestValidationError before the handler runs
        await expect(
            router({
                request: { loadedUrl: 'https://example.com/p', label: 'PRODUCT', userData: { sku: 123 } },
                log,
            } as any),
        ).rejects.toThrow(RequestValidationError);
    });

    test('schema validation preserves the request label and internal metadata on a real Request', async () => {
        const router = createCheerioRouter({
            PRODUCT: z.object({ sku: z.string() }),
        });

        const handled: { label?: string; sku?: string; crawlDepth?: number } = {};
        router.addHandler('PRODUCT', async ({ request }) => {
            handled.label = request.label;
            handled.sku = request.userData.sku;
            handled.crawlDepth = request.crawlDepth;
        });

        const log = { info: vitest.fn(), warn: vitest.fn(), debug: vitest.fn() };

        // a real Request keeps `label` inside `userData` and `crawlDepth` inside the non-enumerable `__crawlee`;
        // both must survive the schema replacing `userData` with the parsed (label-less) value.
        const request = new Request({ url: 'https://example.com/p', label: 'PRODUCT', userData: { sku: 'A1' } });
        request.crawlDepth = 3;

        await router({ request, log } as any);

        expect(handled).toEqual({ label: 'PRODUCT', sku: 'A1', crawlDepth: 3 });
        expect(request.label).toBe('PRODUCT');
        expect(request.crawlDepth).toBe(3);
    });

    test('schema map leaves requests without a registered label untouched', async () => {
        const logs: string[] = [];
        const router = createCheerioRouter({
            PRODUCT: z.object({ sku: z.string() }),
        });

        router.addDefaultHandler(async (ctx) => {
            logs.push(`default ${ctx.request.label ?? 'none'}`);
        });

        const log = { info: vitest.fn(), warn: vitest.fn(), debug: vitest.fn() };

        // a label with no schema is not validated and falls through to the default handler
        await router({
            request: { loadedUrl: 'https://example.com/o', label: 'OTHER', userData: { anything: true } },
            log,
        } as any);
        expect(logs).toEqual(['default OTHER']);
    });

    test('a defaultRoute schema validates requests that fall through to the default handler', async () => {
        const seen: [string, Record<string, unknown>][] = [];
        const router = createCheerioRouter({
            PRODUCT: z.object({ sku: z.string() }),
            [defaultRoute]: z.object({ page: z.coerce.number() }),
        });

        router.addHandler('PRODUCT', async ({ request }) => {
            seen.push(['PRODUCT', request.userData]);
        });
        router.addDefaultHandler(async ({ request }) => {
            seen.push(['default', request.userData]);
        });

        const log = { info: vitest.fn(), warn: vitest.fn(), debug: vitest.fn() };

        // an unregistered label falls through to the default handler and is validated + coerced by its schema
        await router({
            request: { loadedUrl: 'https://example.com/l', label: 'LIST', userData: { page: '2' } },
            log,
        } as any);
        // a registered label keeps using its own schema, not the default one
        await router({
            request: { loadedUrl: 'https://example.com/p', label: 'PRODUCT', userData: { sku: 'x' } },
            log,
        } as any);

        expect(seen).toEqual([
            ['default', { page: 2, label: 'LIST' }],
            ['PRODUCT', { sku: 'x', label: 'PRODUCT' }],
        ]);

        // a default-route request whose userData violates the default schema throws
        await expect(
            router({
                request: { loadedUrl: 'https://example.com/x', label: 'X', userData: { page: 'not-a-number' } },
                log,
            } as any),
        ).rejects.toThrow(RequestValidationError);
    });
});
