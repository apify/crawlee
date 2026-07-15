import { BasicCrawler } from '@crawlee/basic';
import type { CrawlingContext } from '@crawlee/core';
import { MissingRouteError, RequestValidationError, Router } from '@crawlee/core';
import {
    CheerioCrawler,
    type CheerioCrawlingContext,
    createCheerioRouter,
    createPlaywrightRouter,
    createPuppeteerRouter,
    PlaywrightCrawler,
    type PlaywrightCrawlingContext,
    PuppeteerCrawler,
    type PuppeteerCrawlingContext,
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

    test('schema map infers userData types and validates at runtime', async () => {
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

    test('crawler infers the route map from a typed requestHandler and types addRequests/context', () => {
        // type-level only: the block is never executed, it just has to type-check
        const typeOnly = async () => {
            interface Routes {
                PRODUCT: { sku: string; price: number };
                CATEGORY: { categoryId: string };
            }

            const router = createCheerioRouter<CheerioCrawlingContext, Routes>();

            router.addHandler('PRODUCT', async ({ addRequests, enqueueLinks }) => {
                // context methods are typed from the route map
                await addRequests([{ url: 'https://e.com/c', label: 'CATEGORY', userData: { categoryId: 'c1' } }]);
                await enqueueLinks({ urls: ['https://e.com/p'], label: 'PRODUCT', userData: { sku: 's', price: 1 } });
                // @ts-expect-error wrong userData shape for the label
                await addRequests([{ url: 'https://e.com/p', label: 'PRODUCT', userData: { categoryId: 'x' } }]);
                // @ts-expect-error label not present in the route map
                await addRequests([{ url: 'https://e.com/x', label: 'NOPE' }]);
            });

            // the crawler infers `Routes` from the typed router passed as `requestHandler`
            const crawler = new CheerioCrawler({ requestHandler: router });

            await crawler.addRequests([{ url: 'https://e.com/p', label: 'PRODUCT', userData: { sku: 's', price: 1 } }]);
            await crawler.run([
                'https://e.com',
                { url: 'https://e.com/c', label: 'CATEGORY', userData: { categoryId: 'c1' } },
            ]);
            // @ts-expect-error wrong userData shape for the label
            await crawler.addRequests([{ url: 'https://e.com/p', label: 'PRODUCT', userData: { categoryId: 'x' } }]);
            // @ts-expect-error label not present in the route map
            await crawler.addRequests([{ url: 'https://e.com/x', label: 'NOPE' }]);
        };

        expect(typeof typeOnly).toBe('function');
    });

    test('browser crawler also infers the route map from a typed requestHandler', () => {
        // type-level only: never executed
        const typeOnly = async () => {
            interface Routes {
                PRODUCT: { sku: string };
            }

            const router = createPlaywrightRouter<PlaywrightCrawlingContext, Routes>();

            router.addHandler('PRODUCT', async ({ addRequests }) => {
                await addRequests([{ url: 'https://e.com/p', label: 'PRODUCT', userData: { sku: 's' } }]);
                // @ts-expect-error wrong userData shape for the label
                await addRequests([{ url: 'https://e.com/p', label: 'PRODUCT', userData: { sku: 1 } }]);
                // @ts-expect-error label not present in the route map
                await addRequests([{ url: 'https://e.com/x', label: 'NOPE' }]);
            });

            const crawler = new PlaywrightCrawler({ requestHandler: router });

            await crawler.addRequests([{ url: 'https://e.com/p', label: 'PRODUCT', userData: { sku: 's' } }]);
            // @ts-expect-error wrong userData shape for the label
            await crawler.addRequests([{ url: 'https://e.com/p', label: 'PRODUCT', userData: { sku: 1 } }]);
            // @ts-expect-error label not present in the route map
            await crawler.addRequests([{ url: 'https://e.com/x', label: 'NOPE' }]);
        };

        expect(typeof typeOnly).toBe('function');
    });

    test('puppeteer crawler infers the route map too (inherited requestHandler path)', () => {
        // type-level only: never executed
        const typeOnly = async () => {
            interface Routes {
                PRODUCT: { sku: string };
            }

            const router = createPuppeteerRouter<PuppeteerCrawlingContext, Routes>();
            const crawler = new PuppeteerCrawler({ requestHandler: router });

            await crawler.addRequests([{ url: 'https://e.com/p', label: 'PRODUCT', userData: { sku: 's' } }]);
            // @ts-expect-error wrong userData shape for the label
            await crawler.addRequests([{ url: 'https://e.com/p', label: 'PRODUCT', userData: { sku: 1 } }]);
            // @ts-expect-error label not present in the route map
            await crawler.addRequests([{ url: 'https://e.com/x', label: 'NOPE' }]);
        };

        expect(typeof typeOnly).toBe('function');
    });
});
