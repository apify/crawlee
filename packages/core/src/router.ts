import type { CrawlingContext } from './crawlers/crawler_commons';
import type { Awaitable } from './typedefs';
import { MissingRouteError } from './errors';

const defaultRoute = Symbol('default-route');

export interface RouterHandler<Context extends CrawlingContext = CrawlingContext> extends Router<Context> {
    (ctx: Context): Awaitable<void>;
}

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
 */
export class Router<Context extends CrawlingContext> {
    private readonly routes: Map<string | symbol, (ctx: Context) => Awaitable<void>> = new Map();

    /**
     * use Router.create() instead!
     * @ignore
     */
    protected constructor() {}

    /**
     * Registers new route handler for given label.
     */
    addHandler(label: string | symbol, handler: (ctx: Context) => Awaitable<void>) {
        this.validate(label);
        this.routes.set(label, handler);
    }

    /**
     * Registers default route handler.
     */
    addDefaultHandler(handler: (ctx: Context) => Awaitable<void>) {
        this.validate(defaultRoute);
        this.routes.set(defaultRoute, handler);
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

        if (!label) {
            // eslint-disable-next-line max-len
            throw new MissingRouteError(`No default route set up. Please specify 'requestHandler' option or provide default route via 'crawler.router.addDefaultRoute()'.`);
        }

        throw new MissingRouteError(`Route not found for label '${String(label)}' and no default route set up!`);
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

        const func = function (context: Context) {
            const { url, loadedUrl, label } = context.request;
            context.log.debug('Page opened.', { label, url: loadedUrl ?? url });
            return router.getHandler(label)(context);
        };

        Object.setPrototypeOf(func, obj);

        return func as unknown as RouterHandler<Context>;
    }
}
