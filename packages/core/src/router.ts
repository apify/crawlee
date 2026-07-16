import type { Dictionary } from '@crawlee/types';
import type { StandardSchemaV1 } from '@standard-schema/spec';

import type { CrawlingContext, LoadedRequest, RestrictedCrawlingContext } from './crawlers/crawler_commons';
import { MissingRouteError, RequestValidationError } from './errors';
import type { Request } from './request';
import type { Awaitable } from './typedefs';

/**
 * The key of the default route — the fallback handler registered via {@apilink Router.addDefaultHandler}.
 * Use it in a {@apilink RouteSchemas} map to register a schema that validates the `userData` of every request
 * that falls through to the default handler (i.e. whose label has no route of its own).
 */
export const defaultRoute: unique symbol = Symbol('default-route');

/**
 * The crawling context received by a route handler, with `request.userData` narrowed to `UserData`.
 */
export type RouterHandlerContext<Context, UserData extends Dictionary> = Omit<Context, 'request'> & {
    request: LoadedRequest<Request<UserData>>;
};

/**
 * A map of request labels to a [Standard Schema](https://standardschema.dev) (Zod, Valibot, ArkType, …)
 * validating that label's `request.userData`. Pass it to {@apilink Router.create} or a `createXRouter`
 * factory to derive the per-label `request.userData` types *and* validate them at runtime. The optional
 * {@apilink defaultRoute} key registers a schema for requests handled by the default route.
 */
export type RouteSchemas = Record<string, StandardSchemaV1> & {
    [defaultRoute]?: StandardSchemaV1;
};

/**
 * Derives a route map (label → `userData` type) from a {@apilink RouteSchemas} map by inferring each
 * schema's output type. Outputs that are not object-shaped fall back to a plain {@apilink Dictionary}. The
 * {@apilink defaultRoute} schema drives runtime validation only, so it is excluded from the typed route map.
 */
export type RoutesFromSchemas<Schemas extends RouteSchemas> = {
    [Label in Extract<keyof Schemas, string>]: StandardSchemaV1.InferOutput<Schemas[Label]> extends Dictionary
        ? StandardSchemaV1.InferOutput<Schemas[Label]>
        : Dictionary;
};

/** Whether a validation issue points at the top-level `label` key. */
function isLabelIssue(issue: StandardSchemaV1.Issue): boolean {
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
export async function validateUserData(
    label: string | symbol,
    schema: StandardSchemaV1,
    userData: unknown,
): Promise<Dictionary> {
    const { label: _label, ...rest } = (userData ?? {}) as Dictionary;

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
    return { ...(result.value as Dictionary), label };
}

/**
 * The set of labels accepted by {@apilink Router.addHandler}. When the router declares a concrete
 * route map (e.g. `{ PRODUCT: ...; CATEGORY: ... }`), only those labels (plus symbols) are
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
        handler: (ctx: RouterHandlerContext<Context, Routes[Label]>) => Awaitable<void>,
    ): void;

    /**
     * Registers new route handler for given label, explicitly typing `request.userData` via the
     * `UserData` type argument. Useful when the router has no declared route map (the open default)
     * and you want to type a single handler, or to register a handler under a `symbol` label.
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
     * Registers default route handler. As a fallback it can receive any request (including labels not
     * declared in the route map), so `request.userData` defaults to the context's `userData` type
     * (loosely typed by default). Pass an explicit `UserData` type argument to narrow it.
     */
    addDefaultHandler<UserData extends Dictionary = GetUserDataFromRequest<Context['request']>>(
        handler: (ctx: RouterHandlerContext<Context, UserData>) => Awaitable<void>,
    ) {
        this.validate(defaultRoute);
        this.routes.set(defaultRoute, handler);
    }

    /**
     * Returns the {@apilink RouteSchemas|Standard Schema} registered for a label, if any. Used by the crawler
     * to validate `request.userData` when requests are added.
     * @internal
     */
    getSchema(label?: string | symbol): StandardSchemaV1 | undefined {
        if (label != null) {
            const schema = this.schemas.get(label);

            if (schema) {
                return schema;
            }

            // A label with its own route is fully specified; don't fall back to the default-route schema.
            if (this.routes.has(label)) {
                return undefined;
            }
        }

        // Requests with no route of their own fall through to the default handler, so validate their
        // `userData` against the default-route schema, if one was registered.
        return this.schemas.get(defaultRoute);
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
        const label = context.request.label;
        const schema = this.getSchema(label);

        if (schema) {
            context.request.userData = (await validateUserData(
                label!,
                schema,
                context.request.userData,
            )) as GetUserDataFromRequest<Context['request']>;
        }
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
    // The handler overloads keep the second type argument backwards compatible. When it is a route map (every
    // value is a `Dictionary`) the first overload applies and labels are typed per route. Otherwise it fails
    // the `Record<keyof Routes, Dictionary>` constraint and falls through to the second overload, where it is
    // treated as the legacy flat `userData` shape shared by all handlers. The third overload accepts a
    // Standard Schema per label, inferring the route map and validating `userData` at runtime.
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
        routesOrSchemas?: Record<string | symbol, ((ctx: any) => Awaitable<void>) | StandardSchemaV1>,
    ): RouterHandler<Context, any> {
        const router = new Router<Context, any>();
        const obj = Object.create(Function.prototype);

        obj.addHandler = router.addHandler.bind(router);
        obj.addDefaultHandler = router.addDefaultHandler.bind(router);
        obj.getSchema = router.getSchema.bind(router);
        obj.getHandler = router.getHandler.bind(router);
        obj.use = router.use.bind(router);

        // `Reflect.ownKeys` (unlike `Object.entries`) also yields the `defaultRoute` symbol key.
        for (const label of Reflect.ownKeys(routesOrSchemas ?? {})) {
            const value = routesOrSchemas![label];

            if (typeof value === 'function') {
                router.addHandler(label as string, value as (ctx: any) => Awaitable<void>);
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
