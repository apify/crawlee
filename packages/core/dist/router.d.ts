import type { Dictionary, RouterRoutes } from '@crawlee/types';
import type { CrawlingContext } from './crawlers/crawler_commons';
import type { Awaitable } from './typedefs';
import type { Request } from './request';
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
export declare class Router<Context extends CrawlingContext> {
    private readonly routes;
    private readonly middlewares;
    /**
     * use Router.create() instead!
     * @ignore
     */
    protected constructor();
    /**
     * Registers new route handler for given label.
     */
    addHandler<UserData extends Dictionary = GetUserDataFromRequest<Context['request']>>(label: string | symbol, handler: (ctx: Omit<Context, 'request'> & {
        request: Request<UserData>;
    }) => Awaitable<void>): void;
    /**
     * Registers default route handler.
     */
    addDefaultHandler<UserData extends Dictionary = GetUserDataFromRequest<Context['request']>>(handler: (ctx: Omit<Context, 'request'> & {
        request: Request<UserData>;
    }) => Awaitable<void>): void;
    /**
     * Registers a middleware that will be fired before the matching route handler.
     * Multiple middlewares can be registered, they will be fired in the same order.
     */
    use(middleware: (ctx: Context) => Awaitable<void>): void;
    /**
     * Returns route handler for given label. If no label is provided, the default request handler will be returned.
     */
    getHandler(label?: string | symbol): (ctx: Context) => Awaitable<void>;
    /**
     * Throws when the label already exists in our registry.
     */
    private validate;
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
    static create<Context extends CrawlingContext = CrawlingContext, UserData extends Dictionary = GetUserDataFromRequest<Context['request']>>(routes?: RouterRoutes<Context, UserData>): RouterHandler<Context>;
}
export {};
//# sourceMappingURL=router.d.ts.map