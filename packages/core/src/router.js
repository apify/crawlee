import { MissingRouteError, RequestValidationError } from './errors.js';
/**
 * The key of the default route — the fallback handler registered via {@apilink Router.addDefaultHandler}.
 * Use it in a {@apilink RouteSchemas} map to register a schema that validates the `userData` of every request
 * that falls through to the default handler (i.e. whose label has no route of its own).
 */
export const defaultRoute = Symbol('default-route');
/** Whether a validation issue points at the top-level `label` key. */
function isLabelIssue(issue) {
    if (issue.path?.length !== 1) {
        return false;
    }
    const [segment] = issue.path;
    return (typeof segment === 'object' ? segment.key : segment) === 'label';
}
/**
 * Validates `userData` against a {@apilink RouteSchemas|Standard Schema}, returning the parsed (and coerced)
 * value. Throws a {@apilink RequestValidationError} when validation fails.
 * @internal
 */
export async function validateUserData(label, schema, userData) {
    const { label: _label, ...rest } = (userData ?? {});
    // `label` is a Crawlee-managed key that lives inside `userData`, so validating it is opt-in: we validate
    // without it first, letting schemas that don't describe it pass (including `.strict()` ones). A schema that
    // *does* declare `label` reports an issue for the now-missing key — so we re-validate with it included,
    // honouring the declaration. Unlike `userData.__crawlee`, `label` is enumerable, so schemas do see it.
    let result = await schema['~standard'].validate(rest);
    if (result.issues?.some(isLabelIssue)) {
        result = await schema['~standard'].validate({ ...rest, label });
    }
    if (result.issues) {
        throw new RequestValidationError(label, result.issues);
    }
    // Restore the label so it survives schemas that strip undeclared keys.
    return { ...result.value, label };
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
 * To get `request.userData` typed per label, declare a route map and pass it as the second
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
 *
 * Passing a [Standard Schema](https://standardschema.dev) per label instead of a plain type both infers the
 * `request.userData` types *and* validates them at runtime — when the request is handled, and when it is
 * added to the crawler (`crawler.addRequests`, `context.addRequests`, `enqueueLinks`). A failing request
 * throws a {@apilink RequestValidationError}.
 *
 * ```ts
 * import { z } from 'zod';
 * import { createCheerioRouter } from 'crawlee';
 *
 * const router = createCheerioRouter({
 *     PRODUCT: z.object({ sku: z.string(), price: z.number() }),
 *     CATEGORY: z.object({ categoryId: z.string() }),
 * });
 *
 * router.addHandler('PRODUCT', async ({ request }) => {
 *     request.userData.price; // number, inferred from the schema and validated at runtime
 * });
 * ```
 *
 * A single route can take longer than the rest without raising the crawler-wide
 * `requestHandlerTimeoutSecs` for everything - pass a per-route timeout as the last argument:
 *
 * ```ts
 * // LIST pages scroll through a lot of content, DETAIL pages are quick
 * router.addHandler('LIST', async (ctx) => { ... }, { requestHandlerTimeoutSecs: 120 });
 * router.addHandler('DETAIL', async (ctx) => { ... }); // keeps the crawler's default
 * ```
 *
 * When the time a route needs is only apparent once it is already running, call
 * {@apilink CrawlingContext.extendTimeout|`context.extendTimeout`} from inside the handler:
 *
 * ```ts
 * router.addHandler('LIST', async ({ page, extendTimeout }) => {
 *     const pageCount = await countPages(page);
 *     extendTimeout(pageCount * 10); // ask for 10 more seconds per page
 *     await scrapeAllPages(page);
 * });
 * ```
 */
export class Router {
    #routes = new Map();
    #schemas = new Map();
    #timeouts = new Map();
    #middlewares = [];
    /**
     * use Router.create() instead!
     * @ignore
     */
    constructor() { }
    addHandler(label, handler, options = {}) {
        this.validate(label);
        this.#routes.set(label, handler);
        if (options.requestHandlerTimeoutSecs !== undefined) {
            this.#timeouts.set(label, options.requestHandlerTimeoutSecs);
        }
    }
    /**
     * Registers default route handler. As a fallback it can receive any request (including labels not
     * declared in the route map). When the router was created with a {@apilink defaultRoute} schema,
     * `request.userData` is typed from it; otherwise it defaults to the context's (loosely typed) `userData`.
     * Pass an explicit `UserData` type argument to narrow it. Pass {@apilink RouteOptions|`options`} to give the
     * default route its own `requestHandlerTimeoutSecs`, overriding the crawler's default for requests that fall
     * through to it.
     */
    addDefaultHandler(handler, options = {}) {
        this.validate(defaultRoute);
        this.#routes.set(defaultRoute, handler);
        if (options.requestHandlerTimeoutSecs !== undefined) {
            this.#timeouts.set(defaultRoute, options.requestHandlerTimeoutSecs);
        }
    }
    /**
     * Returns the {@apilink RouteSchemas|Standard Schema} registered for a label, if any. Used by the crawler
     * to validate `request.userData` when requests are added.
     * @internal
     */
    getSchema(label) {
        if (label != null) {
            const schema = this.#schemas.get(label);
            if (schema) {
                return schema;
            }
            // A label with its own route is fully specified; don't fall back to the default-route schema.
            if (this.#routes.has(label)) {
                return undefined;
            }
        }
        // Requests with no route of their own fall through to the default handler, so validate their
        // `userData` against the default-route schema, if one was registered.
        return this.#schemas.get(defaultRoute);
    }
    /**
     * Registers a middleware that will be fired before the matching route handler.
     * Multiple middlewares can be registered, they will be fired in the same order.
     */
    use(middleware) {
        this.#middlewares.push(middleware);
    }
    /**
     * Returns the `requestHandlerTimeoutSecs` registered for a label, or `undefined` when the route did not
     * override it and the crawler's own timeout should apply. Falls back to the default route the same way
     * {@apilink Router.getHandler|`getHandler`} does, so a label with no route of its own inherits whatever
     * the default route asked for. Used by the crawler; not meant to be called directly.
     */
    getTimeoutSecs(label) {
        if (label && this.#routes.has(label)) {
            return this.#timeouts.get(label);
        }
        return this.#timeouts.get(defaultRoute);
    }
    /**
     * The longest `requestHandlerTimeoutSecs` any route asked for, or `undefined` when no route overrides it.
     * The crawler needs an upper bound up front, before it knows which routes a run will actually hit.
     */
    getMaxTimeoutSecs() {
        return this.#timeouts.size > 0 ? Math.max(...this.#timeouts.values()) : undefined;
    }
    /**
     * Returns route handler for given label. If no label is provided, the default request handler will be returned.
     */
    getHandler(label) {
        if (label && this.#routes.has(label)) {
            return this.#routes.get(label);
        }
        if (this.#routes.has(defaultRoute)) {
            return this.#routes.get(defaultRoute);
        }
        throw new MissingRouteError(`Route not found for label '${String(label)}'.` +
            ' You must set up a route for this label or a default route.' +
            ' Use `requestHandler`, `router.addHandler` or `router.addDefaultHandler`.');
    }
    /**
     * Validates `request.userData` against the schema registered for its label (if any), replacing it with
     * the parsed value. Throws a {@apilink RequestValidationError} when validation fails.
     */
    async validateRequest(context) {
        const label = context.request.label;
        const schema = this.getSchema(label);
        if (schema) {
            context.request.userData = (await validateUserData(label, schema, context.request.userData));
        }
    }
    /**
     * Throws when the label already exists in our registry.
     */
    validate(label) {
        if (this.#routes.has(label)) {
            const message = label === defaultRoute
                ? `Default route is already defined!`
                : `Route for label '${String(label)}' is already defined!`;
            throw new Error(message);
        }
    }
    static create(routesOrSchemas) {
        const router = new Router();
        const obj = Object.create(Function.prototype);
        obj.addHandler = router.addHandler.bind(router);
        obj.addDefaultHandler = router.addDefaultHandler.bind(router);
        obj.getSchema = router.getSchema.bind(router);
        obj.getHandler = router.getHandler.bind(router);
        obj.getTimeoutSecs = router.getTimeoutSecs.bind(router);
        obj.getMaxTimeoutSecs = router.getMaxTimeoutSecs.bind(router);
        obj.use = router.use.bind(router);
        // `Reflect.ownKeys` (unlike `Object.entries`) also yields the `defaultRoute` symbol key.
        for (const label of Reflect.ownKeys(routesOrSchemas ?? {})) {
            const value = routesOrSchemas[label];
            if (typeof value === 'function') {
                router.addHandler(label, value);
            }
            else {
                router.#schemas.set(label, value);
            }
        }
        const func = async function (context) {
            const { url, loadedUrl, label } = context.request;
            context.log.debug('Page opened.', { label, url: loadedUrl ?? url });
            await router.validateRequest(context);
            for (const middleware of router.#middlewares) {
                await middleware(context);
            }
            return router.getHandler(label)(context);
        };
        Object.setPrototypeOf(func, obj);
        return func;
    }
}
