import type { Dictionary } from '@crawlee/types';
import type { StandardSchemaV1 } from '@standard-schema/spec';

import type {
    CrawlingContext,
    LoadedRequest,
    RestrictedCrawlingContext,
    TypedContextAddRequests,
    TypedContextEnqueueLinks,
} from './crawlers/crawler_commons.js';
import { MissingRouteError, RequestValidationError } from './errors.js';
import type { Request } from './request.js';
import type { Awaitable } from './typedefs.js';

const defaultRoute = Symbol('default-route');

/**
 * The crawling context received by a route handler, with `request.userData` narrowed to `UserData`, and
 * `addRequests`/`enqueueLinks` typed according to the router's route map (`Routes`) so that enqueuing a
 * request under a declared label requires the matching `userData` shape.
 */
export type RouterHandlerContext<
    Context,
    UserData extends Dictionary,
    Routes extends Record<keyof Routes, Dictionary>,
> = Omit<Context, 'request' | 'addRequests' | 'enqueueLinks'> & {
    request: LoadedRequest<Request<UserData>>;
    addRequests: TypedContextAddRequests<Routes>;
} & (Context extends { enqueueLinks: infer EnqueueLinks }
        ? { enqueueLinks: TypedContextEnqueueLinks<EnqueueLinks, Routes> }
        : {});

/**
 * The set of labels accepted by {@apilink Router.addHandler}. When the router declares a concrete
 * route map (e.g. `{ PRODUCT: ...; CATEGORY: ... }`), only those labels (plus symbols) are
 * allowed — unknown labels become a compile-time error. When the map is left open (the default
 * `Record<string, ...>`), any string or symbol label is accepted, preserving the original behaviour.
 */
export type RouterLabel<Routes extends Record<keyof Routes, Dictionary>> = string extends keyof Routes
    ? string | symbol
    : (keyof Routes & string) | symbol;

/**
 * A map of request labels to a [Standard Schema](https://standardschema.dev) (Zod, Valibot, ArkType, …)
 * validating that label's `request.userData`. Pass it to {@apilink Router.create} or a `createXRouter`
 * factory to derive the per-label `request.userData` types *and* validate them at runtime before the
 * matching handler runs.
 */
export type RouteSchemas = Record<string, StandardSchemaV1>;

/**
 * Derives a route map (label → `userData` type) from a {@apilink RouteSchemas} map by inferring each
 * schema's output type. Outputs that are not object-shaped fall back to a plain {@apilink Dictionary}.
 */
export type RoutesFromSchemas<Schemas extends RouteSchemas> = {
    [Label in keyof Schemas]: StandardSchemaV1.InferOutput<Schemas[Label]> extends Dictionary
        ? StandardSchemaV1.InferOutput<Schemas[Label]>
        : Dictionary;
};

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
 * ## Typed labels
 *
 * To get `request.userData` typed per label, declare a route map and pass it as the second type
 * argument. The label passed to {@apilink Router.addHandler} then drives the type of `request.userData`,
 * and unknown labels are rejected at compile time:
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
 * ## Schema-validated labels
 *
 * Passing a [Standard Schema](https://standardschema.dev) per label both infers the `request.userData`
 * types *and* validates them at runtime before the handler runs (replacing `request.userData` with the
 * parsed value). A failing request throws a {@apilink RequestValidationError}.
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
 */
export class Router<
    Context extends Omit<RestrictedCrawlingContext, 'enqueueLinks'>,
    Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>,
> {
    private readonly routes: Map<string | symbol, (ctx: any) => Awaitable<void>> = new Map();
    private readonly schemas: Map<string | symbol, StandardSchemaV1> = new Map();
    private readonly middlewares: ((ctx: Context) => Awaitable<void>)[] = [];

    /**
     * use Router.create() instead!
     * @ignore
     */
    protected constructor() {}

    /**
     * Registers new route handler for given label. When the router declares a route map, the
     * `label` is restricted to the declared labels and `request.userData` is typed accordingly.
     */
    addHandler<Label extends keyof Routes & string>(
        label: Label,
        handler: (ctx: RouterHandlerContext<Context, Routes[Label], Routes>) => Awaitable<void>,
    ): void;

    /**
     * Registers new route handler for given label, explicitly typing `request.userData` via the
     * `UserData` type argument. Useful when the router has no declared route map (the open default)
     * and you want to type a single handler, or to register a handler under a `symbol` label.
     */
    addHandler<UserData extends Dictionary = GetUserDataFromRequest<Context['request']>>(
        label: RouterLabel<Routes>,
        handler: (ctx: RouterHandlerContext<Context, UserData, Routes>) => Awaitable<void>,
    ): void;

    addHandler(label: string | symbol, handler: (ctx: any) => Awaitable<void>): void {
        this.validate(label);
        this.routes.set(label, handler);
    }

    /**
     * Registers default route handler. As a fallback it can receive any request (including labels not
     * declared in the route map), so `request.userData` defaults to the context's `userData` type
     * (loosely typed by default). Pass an explicit `UserData` type argument to narrow it.
     */
    addDefaultHandler<UserData extends Dictionary = GetUserDataFromRequest<Context['request']>>(
        handler: (ctx: RouterHandlerContext<Context, UserData, Routes>) => Awaitable<void>,
    ) {
        this.validate(defaultRoute);
        this.routes.set(defaultRoute, handler);
    }

    /**
     * Registers {@apilink RouteSchemas|Standard Schema} validators for the given labels. Before a matching
     * route handler runs, `request.userData` is validated against the label's schema and replaced with the
     * parsed value; a failing request throws a {@apilink RequestValidationError}.
     */
    addSchemas(schemas: Partial<Record<keyof Routes & string, StandardSchemaV1>>) {
        for (const [label, schema] of Object.entries(schemas)) {
            if (schema) {
                this.schemas.set(label, schema as StandardSchemaV1);
            }
        }
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
     * Validates `request.userData` against the schema registered for its label (if any), replacing it with
     * the parsed value. Throws a {@apilink RequestValidationError} when validation fails.
     */
    private async validateRequest(context: Context) {
        const { label } = context.request;
        const schema = label != null ? this.schemas.get(label) : undefined;

        if (!schema) {
            return;
        }

        const result = await schema['~standard'].validate(context.request.userData);

        if (result.issues) {
            throw new RequestValidationError(label!, result.issues);
        }

        context.request.userData = result.value as Dictionary;
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
     *
     * Passing a {@apilink RouteSchemas|Standard Schema} per label instead of handlers infers the
     * `request.userData` types and validates them at runtime:
     *
     * ```ts
     * import { z } from 'zod';
     *
     * const router = Router.create({
     *     PRODUCT: z.object({ sku: z.string() }),
     * });
     * ```
     */
    // The handler overloads keep the second type argument backwards compatible. When it is a route map
    // (every value is a `Dictionary`) the first overload applies and labels are typed per route. Otherwise
    // it fails the `Record<keyof Routes, Dictionary>` constraint and falls through to the second overload,
    // where it is treated as the legacy flat `userData` shape shared by all handlers. The third overload
    // accepts a Standard Schema per label, inferring the route map and validating `userData` at runtime.
    static create<
        Context extends Omit<RestrictedCrawlingContext, 'enqueueLinks'> = CrawlingContext,
        Routes extends Record<keyof Routes, Dictionary> = Record<string, GetUserDataFromRequest<Context['request']>>,
    >(routes?: RouterRoutes<Context, Routes>): RouterHandler<Context, Routes>;

    static create<
        Context extends Omit<RestrictedCrawlingContext, 'enqueueLinks'> = CrawlingContext,
        UserData extends Dictionary = GetUserDataFromRequest<Context['request']>,
    >(routes?: RouterRoutes<Context, Record<string, UserData>>): RouterHandler<Context, Record<string, UserData>>;

    static create<
        Context extends Omit<RestrictedCrawlingContext, 'enqueueLinks'> = CrawlingContext,
        const Schemas extends RouteSchemas = RouteSchemas,
    >(schemas: Schemas): RouterHandler<Context, RoutesFromSchemas<Schemas>>;

    static create<Context extends Omit<RestrictedCrawlingContext, 'enqueueLinks'> = CrawlingContext>(
        routesOrSchemas?: Record<string, ((ctx: any) => Awaitable<void>) | StandardSchemaV1>,
    ): RouterHandler<Context, any> {
        const router = new Router<Context, any>();
        const obj = Object.create(Function.prototype);

        obj.addHandler = router.addHandler.bind(router);
        obj.addDefaultHandler = router.addDefaultHandler.bind(router);
        obj.addSchemas = router.addSchemas.bind(router);
        obj.getHandler = router.getHandler.bind(router);
        obj.use = router.use.bind(router);

        for (const [label, value] of Object.entries(routesOrSchemas ?? {})) {
            if (typeof value === 'function') {
                router.addHandler(label, value as (ctx: any) => Awaitable<void>);
            } else {
                router.schemas.set(label, value);
            }
        }

        const func = async function (context: Context) {
            const { url, loadedUrl, label } = context.request;
            context.log.debug('Page opened.', { label, url: loadedUrl ?? url });

            await router.validateRequest(context);

            for (const middleware of router.middlewares) {
                await middleware(context);
            }

            return router.getHandler(label)(context);
        };

        Object.setPrototypeOf(func, obj);

        return func as unknown as RouterHandler<Context, any>;
    }
}
