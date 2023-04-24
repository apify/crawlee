"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Router = void 0;
const errors_1 = require("./errors");
const defaultRoute = Symbol('default-route');
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
class Router {
    /**
     * use Router.create() instead!
     * @ignore
     */
    constructor() {
        Object.defineProperty(this, "routes", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "middlewares", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
    }
    /**
     * Registers new route handler for given label.
     */
    addHandler(label, handler) {
        this.validate(label);
        this.routes.set(label, handler);
    }
    /**
     * Registers default route handler.
     */
    addDefaultHandler(handler) {
        this.validate(defaultRoute);
        this.routes.set(defaultRoute, handler);
    }
    /**
     * Registers a middleware that will be fired before the matching route handler.
     * Multiple middlewares can be registered, they will be fired in the same order.
     */
    use(middleware) {
        this.middlewares.push(middleware);
    }
    /**
     * Returns route handler for given label. If no label is provided, the default request handler will be returned.
     */
    getHandler(label) {
        if (label && this.routes.has(label)) {
            return this.routes.get(label);
        }
        if (this.routes.has(defaultRoute)) {
            return this.routes.get(defaultRoute);
        }
        throw new errors_1.MissingRouteError(`Route not found for label '${String(label)}'.`
            + ' You must set up a route for this label or a default route.'
            + ' Use `requestHandler`, `router.addHandler` or `router.addDefaultHandler`.');
    }
    /**
     * Throws when the label already exists in our registry.
     */
    validate(label) {
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
    static create(routes) {
        const router = new Router();
        const obj = Object.create(Function.prototype);
        obj.addHandler = router.addHandler.bind(router);
        obj.addDefaultHandler = router.addDefaultHandler.bind(router);
        obj.getHandler = router.getHandler.bind(router);
        obj.use = router.use.bind(router);
        for (const [label, handler] of Object.entries(routes ?? {})) {
            router.addHandler(label, handler);
        }
        const func = async function (context) {
            const { url, loadedUrl, label } = context.request;
            context.log.debug('Page opened.', { label, url: loadedUrl ?? url });
            for (const middleware of router.middlewares) {
                await middleware(context);
            }
            return router.getHandler(label)(context);
        };
        Object.setPrototypeOf(func, obj);
        return func;
    }
}
exports.Router = Router;
//# sourceMappingURL=router.js.map