import type { Dictionary } from '@crawlee/types';
import type { CrawlingContext } from './crawlers/crawler_commons';
import type { Awaitable } from './typedefs';
import type { Request } from './request';
import { MissingRouteError } from './errors';

const defaultRoute = Symbol('default-route');

export interface RouterHandler<Context extends CrawlingContext = CrawlingContext> extends Router<Context> {
    (ctx: Context): Awaitable<void>;
}

type GetUserDataFromRequest<T> = T extends Request<infer Y> ? Y : never;

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
 * Middlewares are also supported via the `router.use` method. There can be multiple
 * middlewares for a single router, they will be executed sequentially in the same
 * order as they were registered.
 *
 * ```ts
 * crawler.router.use(async (ctx) => {
 *    ctx.log.info('...');
 * });
 */
export class Router<Context extends CrawlingContext> {
    private readonly routes: Map<string | symbol, (ctx: Context) => Awaitable<void>> = new Map();
    private readonly middlewares: ((ctx: Context) => Awaitable<void>)[] = [];

    /**
     * use Router.create() instead!
     * @ignore
     */
    protected constructor() {}

    /**
     * Registers new route handler for given label.
     */
    addHandler<UserData extends Dictionary = GetUserDataFromRequest<Context['request']>>(
        label: string | symbol,
        handler: (ctx: Omit<Context, 'request'> & { request: Request<UserData> }) => Awaitable<void>,
    ) {
        this.validate(label);
        this.routes.set(label, handler);
    }

    /**
     * Registers default route handler.
     */
    addDefaultHandler<UserData extends Dictionary = GetUserDataFromRequest<Context['request']>>(
        handler: (ctx: Omit<Context, 'request'> & { request: Request<UserData> }) => Awaitable<void>,
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
            `Route not found for label '${String(label)}'.`
            + ' You must set up a route for this label or a default route.'
            + ' Use `requestHandler`, `router.addHandler` or `router.addDefaultHandler`.',
        );
    }

    /**
     * Throws when the label already exists in our registry.
     */
    private validate(label: string | symbol) {
        if (this.routes.has(label)) {
            const message = label === defaultRoute
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
    static create<Context extends CrawlingContext = CrawlingContext>(): RouterHandler<Context> {
        const router = new Router<Context>();
        const obj = Object.create(Function.prototype);

        obj.addHandler = router.addHandler.bind(router);
        obj.addDefaultHandler = router.addDefaultHandler.bind(router);
        obj.getHandler = router.getHandler.bind(router);
        obj.use = router.use.bind(router);

        const func = async function (context: Context) {
            const { url, loadedUrl, label } = context.request;
            context.log.debug('Page opened.', { label, url: loadedUrl ?? url });

            for (const middleware of router.middlewares) {
                await middleware(context);
            }

            return router.getHandler(label)(context);
        };

        Object.setPrototypeOf(func, obj);

        return func as unknown as RouterHandler<Context>;
    }
}
