import type { Dictionary } from '@crawlee/types';

import type { CrawlingContext, LoadedRequest, RestrictedCrawlingContext } from './crawlers/crawler_commons';
import { MissingRouteError } from './errors';
import type { Request } from './request';
import type { Awaitable } from './typedefs';

const defaultRoute = Symbol('default-route');

/**
 * A map of request labels to the shape of `request.userData` expected for that label. Pass it as the
 * `Routes` type argument of {@apilink Router} (or a `createXRouter` factory) to get per-label typing of
 * `request.userData` and autocomplete/validation of labels in {@apilink Router.addHandler}.
 *
 * ```ts
 * interface MyRoutes {
 *     PRODUCT: { sku: string; price: number };
 *     CATEGORY: { categoryId: string };
 * }
 * ```
 */
export type RouteMap = Record<string, Dictionary>;

/**
 * The crawling context received by a route handler, with `request.userData` narrowed to `UserData`.
 */
export type RouterHandlerContext<Context, UserData extends Dictionary> = Omit<Context, 'request'> & {
    request: LoadedRequest<Request<UserData>>;
};

/**
 * The set of labels accepted by {@apilink Router.addHandler}. When the router declares a concrete
 * {@apilink RouteMap} (e.g. `{ PRODUCT: ...; CATEGORY: ... }`), only those labels (plus symbols) are
 * allowed — unknown labels become a compile-time error. When the map is left open (the default
 * `Record<string, ...>`), any string or symbol label is accepted, preserving the original behaviour.
 */
export type RouterLabel<Routes extends Record<keyof Routes, Dictionary>> = string extends keyof Routes
    ? string | symbol
    : (keyof Routes & string) | symbol;

export interface RouterHandler<
    Context extends Omit<RestrictedCrawlingContext, 'enqueueLinks'> = CrawlingContext,
    Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>,
> extends Router<Context, Routes> {
    (ctx: Context): Awaitable<void>;
}

export type GetUserDataFromRequest<T> = T extends Request<infer Y> ? Y : never;

export type RouterRoutes<Context, Routes extends Record<keyof Routes, Dictionary>> = {
    [Label in keyof Routes]: (ctx: Omit<Context, 'request'> & { request: Request<Routes[Label]> }) => Awaitable<void>;
};

/**
 * Simple router that works based on request labels. This instance can then serve as a `requestHandler` of your crawler.
 *
 * ```ts
 * import { Router, CheerioCrawler, CheerioCrawlingContext } from 'crawlee';
 *
 * const router = Router.create<CheerioCrawlingContext>();
 *
 * // we can also use factory methods for specific crawling contexts, the above equals to:
 * // import { createCheerioRouter } from 'crawlee';
 * // const router = createCheerioRouter();
 *
 * router.addHandler('label-a', async (ctx) => {
 *    ctx.log.info('...');
 * });
 * router.addDefaultHandler(async (ctx) => {
 *    ctx.log.info('...');
 * });
 *
 * const crawler = new CheerioCrawler({
 *     requestHandler: router,
 * });
 * await crawler.run();
 * ```
 *
 * Alternatively we can use the default router instance from crawler object:
 *
 * ```ts
 * import { CheerioCrawler } from 'crawlee';
 *
 * const crawler = new CheerioCrawler();
 *
 * crawler.router.addHandler('label-a', async (ctx) => {
 *    ctx.log.info('...');
 * });
 * crawler.router.addDefaultHandler(async (ctx) => {
 *    ctx.log.info('...');
 * });
 *
 * await crawler.run();
 * ```
 *
 * For convenience, we can also define the routes right when creating the router:
 *
 * ```ts
 * import { CheerioCrawler, createCheerioRouter } from 'crawlee';
 * const crawler = new CheerioCrawler({
 *     requestHandler: createCheerioRouter({
 *         'label-a': async (ctx) => { ... },
 *         'label-b': async (ctx) => { ... },
 *     })},
 * });
 * await crawler.run();
 * ```
 *
 * Middlewares are also supported via the `router.use` method. There can be multiple
 * middlewares for a single router, they will be executed sequentially in the same
 * order as they were registered.
 *
 * ```ts
 * crawler.router.use(async (ctx) => {
 *    ctx.log.info('...');
 * });
 * ```
 *
 * To get `request.userData` typed per label, declare a {@apilink RouteMap} and pass it as the second
 * type argument. The label passed to {@apilink Router.addHandler} then drives the type of
 * `request.userData`, and unknown labels are rejected at compile time:
 *
 * ```ts
 * import { createCheerioRouter, CheerioCrawlingContext } from 'crawlee';
 *
 * interface Routes {
 *     PRODUCT: { sku: string; price: number };
 *     CATEGORY: { categoryId: string };
 * }
 *
 * const router = createCheerioRouter<CheerioCrawlingContext, Routes>();
 *
 * router.addHandler('PRODUCT', async ({ request }) => {
 *     request.userData.sku;   // string
 *     request.userData.price; // number
 * });
 *
 * router.addHandler('TYPO', async () => {}); // compile error: not a known label
 * ```
 */
export class Router<
    Context extends Omit<RestrictedCrawlingContext, 'enqueueLinks'>,
    Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>,
> {
    private readonly routes: Map<string | symbol, (ctx: any) => Awaitable<void>> = new Map();
    private readonly middlewares: ((ctx: Context) => Awaitable<void>)[] = [];

    /**
     * use Router.create() instead!
     * @ignore
     */
    protected constructor() {}

    /**
     * Registers new route handler for given label. When the router declares a {@apilink RouteMap}, the
     * `label` is restricted to the declared labels and `request.userData` is typed accordingly.
     */
    addHandler<Label extends keyof Routes & string>(
        label: Label,
        handler: (ctx: RouterHandlerContext<Context, Routes[Label]>) => Awaitable<void>,
    ): void;

    /**
     * Registers new route handler for given label, with an explicit `request.userData` type. Use this
     * overload to type a handler whose label is not part of the router's {@apilink RouteMap}.
     */
    addHandler<UserData extends Dictionary = GetUserDataFromRequest<Context['request']>>(
        label: RouterLabel<Routes>,
        handler: (ctx: RouterHandlerContext<Context, UserData>) => Awaitable<void>,
    ): void;

    addHandler(label: string | symbol, handler: (ctx: any) => Awaitable<void>): void {
        this.validate(label);
        this.routes.set(label, handler);
    }

    /**
     * Registers default route handler. By default `request.userData` is typed as the union of all
     * `userData` shapes declared in the router's {@apilink RouteMap}.
     */
    addDefaultHandler<UserData extends Dictionary = Routes[keyof Routes]>(
        handler: (ctx: RouterHandlerContext<Context, UserData>) => Awaitable<void>,
    ) {
        this.validate(defaultRoute);
        this.routes.set(defaultRoute, handler);
    }

    /**
     * Registers a middleware that will be fired before the matching route handler.
     * Multiple middlewares can be registered, they will be fired in the same order.
     */
    use(middleware: (ctx: Context) => Awaitable<void>) {
        this.middlewares.push(middleware);
    }

    /**
     * Returns route handler for given label. If no label is provided, the default request handler will be returned.
     */
    getHandler(label?: string | symbol): (ctx: Context) => Awaitable<void> {
        if (label && this.routes.has(label)) {
            return this.routes.get(label)!;
        }

        if (this.routes.has(defaultRoute)) {
            return this.routes.get(defaultRoute)!;
        }

        throw new MissingRouteError(
            `Route not found for label '${String(label)}'.` +
                ' You must set up a route for this label or a default route.' +
                ' Use `requestHandler`, `router.addHandler` or `router.addDefaultHandler`.',
        );
    }

    /**
     * Throws when the label already exists in our registry.
     */
    private validate(label: string | symbol) {
        if (this.routes.has(label)) {
            const message =
                label === defaultRoute
                    ? `Default route is already defined!`
                    : `Route for label '${String(label)}' is already defined!`;
            throw new Error(message);
        }
    }

    /**
     * Creates new router instance. This instance can then serve as a `requestHandler` of your crawler.
     *
     * ```ts
     * import { Router, CheerioCrawler, CheerioCrawlingContext } from 'crawlee';
     *
     * const router = Router.create<CheerioCrawlingContext>();
     * router.addHandler('label-a', async (ctx) => {
     *    ctx.log.info('...');
     * });
     * router.addDefaultHandler(async (ctx) => {
     *    ctx.log.info('...');
     * });
     *
     * const crawler = new CheerioCrawler({
     *     requestHandler: router,
     * });
     * await crawler.run();
     * ```
     */
    static create<
        Context extends Omit<RestrictedCrawlingContext, 'enqueueLinks'> = CrawlingContext,
        UserData extends Dictionary = GetUserDataFromRequest<Context['request']>,
        Routes extends Record<keyof Routes, Dictionary> = Record<string, UserData>,
    >(routes?: RouterRoutes<Context, Routes>): RouterHandler<Context, Routes> {
        const router = new Router<Context, Routes>();
        const obj = Object.create(Function.prototype);

        obj.addHandler = router.addHandler.bind(router);
        obj.addDefaultHandler = router.addDefaultHandler.bind(router);
        obj.getHandler = router.getHandler.bind(router);
        obj.use = router.use.bind(router);

        for (const [label, handler] of Object.entries(routes ?? {})) {
            router.addHandler(label as keyof Routes & string, handler as (ctx: any) => Awaitable<void>);
        }

        const func = async function (context: Context) {
            const { url, loadedUrl, label } = context.request;
            context.log.debug('Page opened.', { label, url: loadedUrl ?? url });

            for (const middleware of router.middlewares) {
                await middleware(context);
            }

            return router.getHandler(label)(context);
        };

        Object.setPrototypeOf(func, obj);

        return func as unknown as RouterHandler<Context, Routes>;
    }
}
