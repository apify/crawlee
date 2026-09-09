import type {
    AddRequestsBatchedResult,
    ContextPipeline,
    CrawlingContext,
    EnqueueLinksOptions,
    ExtractLinksOptions,
    GetUserDataFromRequest,
} from '@crawlee/basic';
import { EnqueueStrategy, NavigationSkippedError, resolveBaseUrlForEnqueueLinksFiltering } from '@crawlee/basic';
import type { Awaitable, Dictionary } from '@crawlee/types';
import type { CheerioAPI } from 'cheerio';
import { sleep } from '@crawlee/utils';

import type { HttpCrawlerOptions, InternalHttpCrawlingContext } from './http-crawler.js';
import { HttpCrawler } from './http-crawler.js';

/**
 * The minimum a {@apilink DOMParser} has to contribute to the crawling context - the serialized document, used by
 * the {@apilink DOMCrawlingContext.parseWithCheerio|`parseWithCheerio`} helper.
 */
export interface DOMParseResult {
    body: string;
}

/**
 * Turns a response body into a DOM representation and knows how to query it. Passing one to {@apilink DOMCrawler}
 * is what makes the crawler jsdom-based, linkedom-based, or based on a DOM implementation of your own.
 *
 * **Example usage:**
 * ```ts
 * import { DOMCrawler } from 'crawlee';
 * import type { DOMParser } from 'crawlee';
 *
 * const myParser: DOMParser<{ body: string }> = {
 *     // ...
 * };
 *
 * const crawler = new DOMCrawler({
 *     parser: myParser,
 *     async requestHandler({ body }) {
 *         // ...
 *     },
 * });
 * ```
 */
export interface DOMParser<Parsed extends DOMParseResult> {
    /**
     * The context members {@apilink DOMParser.parse|`parse`} contributes, mapped to `true`. Used to build the
     * placeholders that report a helpful error when the members are accessed after `skipNavigation` - the `Record`
     * type forces every key of `Parsed` to be listed, so the compiler catches an omission that would otherwise
     * yield `undefined` (rather than throwing) after `skipNavigation`.
     */
    readonly placeholderMembers: Record<keyof Parsed & string, true>;

    parse(context: InternalHttpCrawlingContext): Awaitable<Parsed>;

    /**
     * Returns the URLs the `selector` matches, resolved against `baseUrl`.
     */
    extractLinks(parsed: Parsed, selector: string, baseUrl: string): Awaitable<string[]>;

    /**
     * Returns the current matches of `selector`. Only the count is used, by
     * {@apilink DOMCrawlingContext.waitForSelector|`waitForSelector`}.
     */
    select(parsed: Parsed, selector: string): Awaitable<ArrayLike<unknown>>;

    /**
     * Whether the parse result can change after {@apilink DOMParser.parse|`parse`} returned - the case when the DOM
     * implementation runs the page scripts. If it can, {@apilink DOMCrawlingContext.waitForSelector|`waitForSelector`}
     * polls until the timeout elapses; otherwise it fails as soon as the selector does not match.
     */
    readonly mutable?: boolean;

    /**
     * Returns a Cheerio handle over the parse result, for parsers that are backed by Cheerio anyway. Without it,
     * {@apilink DOMCrawlingContext.parseWithCheerio|`parseWithCheerio`} parses
     * {@apilink DOMParseResult.body|`body`} again.
     */
    toCheerio?(parsed: Parsed): Awaitable<CheerioAPI>;

    /**
     * Releases whatever {@apilink DOMParser.parse|`parse`} allocated. Called after the request handler finishes or
     * fails, and skipped entirely when navigation was skipped.
     */
    cleanup?(parsed: Parsed): Awaitable<void>;
}

export interface DOMCrawlingHelpers {
    /**
     * Extracts URLs from the parsed DOM, without adding them to the request queue.
     */
    extractLinks(options?: ExtractLinksOptions): Promise<string[]>;

    /**
     * Helper function for extracting URLs from the parsed DOM and adding them to the request queue.
     */
    enqueueLinks(options?: EnqueueLinksOptions): Promise<AddRequestsBatchedResult>;

    /**
     * Wait for an element matching the selector to appear. The `timeoutMs` only has an effect when the parser is
     * {@apilink DOMParser.mutable|`mutable`} (e.g. {@apilink JSDOMCrawler} with `runScripts: true`); otherwise the
     * selector is checked once and the call resolves or throws immediately.
     * Timeout defaults to 5s.
     *
     * **Example usage:**
     * ```ts
     * async requestHandler({ waitForSelector, parseWithCheerio }) {
     *     await waitForSelector('article h1');
     *     const $ = await parseWithCheerio();
     *     const title = $('title').text();
     * });
     * ```
     */
    waitForSelector(selector: string, timeoutMs?: number): Promise<void>;

    /**
     * Returns Cheerio handle, allowing to work with the data same way as with {@apilink CheerioCrawler}.
     * When provided with the `selector` argument, it will throw if it's not available.
     *
     * **Example usage:**
     * ```javascript
     * async requestHandler({ parseWithCheerio }) {
     *     const $ = await parseWithCheerio();
     *     const title = $('title').text();
     * });
     * ```
     */
    parseWithCheerio(selector?: string, timeoutMs?: number): Promise<CheerioAPI>;
}

export type DOMCrawlingContext<
    Parsed extends DOMParseResult = DOMParseResult,
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
> = InternalHttpCrawlingContext<UserData, JSONData> & Parsed & DOMCrawlingHelpers;

export interface DOMCrawlerOptions<
    Parsed extends DOMParseResult = DOMParseResult,
    ContextExtension = Dictionary<never>,
    ExtendedContext extends DOMCrawlingContext<Parsed> = DOMCrawlingContext<Parsed> & ContextExtension,
    Routes extends Record<keyof Routes, Dictionary> = Record<string, any>,
    StatisticStateExtension extends object = {},
> extends HttpCrawlerOptions<
    DOMCrawlingContext<Parsed>,
    ContextExtension,
    ExtendedContext,
    Routes,
    StatisticStateExtension
> {
    /**
     * The DOM implementation to parse the response bodies with. Its parse result becomes part of the crawling
     * context, so the members the request handler receives follow from the parser you pass.
     */
    parser: DOMParser<Parsed>;
}

/**
 * An {@apilink HttpCrawler} that parses each response into a DOM using the {@apilink DOMCrawlerOptions.parser|`parser`}
 * it is given, and exposes the parse result plus the {@apilink DOMCrawlingContext.enqueueLinks|`enqueueLinks`} and
 * {@apilink DOMCrawlingContext.extractLinks|`extractLinks`} helpers on the crawling context.
 *
 * {@apilink JSDOMCrawler} and {@apilink LinkeDOMCrawler} are this crawler with a parser already chosen.
 *
 * @category Crawlers
 */
export class DOMCrawler<
    Parsed extends DOMParseResult = DOMParseResult,
    ContextExtension = Dictionary<never>,
    ExtendedContext extends DOMCrawlingContext<Parsed> = DOMCrawlingContext<Parsed> & ContextExtension,
    Routes extends Record<keyof Routes, Dictionary> = Record<
        string,
        GetUserDataFromRequest<DOMCrawlingContext<Parsed>['request']>
    >,
    StatisticStateExtension extends object = {},
> extends HttpCrawler<DOMCrawlingContext<Parsed>, ContextExtension, ExtendedContext, Routes, StatisticStateExtension> {
    readonly #parser: DOMParser<Parsed>;

    constructor(
        options: DOMCrawlerOptions<Parsed, ContextExtension, ExtendedContext, Routes, StatisticStateExtension>,
    ) {
        const { parser, contextPipelineBuilder, ...rest } = options;

        super({
            ...rest,
            contextPipelineBuilder: contextPipelineBuilder ?? (() => this.buildContextPipeline()),
        });

        this.#parser = parser;
    }

    protected override buildContextPipeline(): ContextPipeline<CrawlingContext, DOMCrawlingContext<Parsed>> {
        return super
            .buildContextPipeline()
            .compose({
                action: async (context) => this.#parseContent(context),
                cleanup: async (context) => {
                    // The `skipNavigation` placeholders below throw on access, so there is nothing to clean up.
                    if (!context.request.skipNavigation) {
                        await this.#parser.cleanup?.(context as unknown as Parsed);
                    }
                },
            })
            .compose({ action: async (context) => this.#addHelpers(context) });
    }

    async #parseContent(context: InternalHttpCrawlingContext): Promise<Parsed> {
        try {
            return await this.#parser.parse(context);
        } catch (err) {
            if (err instanceof NavigationSkippedError) {
                return Object.defineProperties(
                    {},
                    Object.fromEntries(
                        (Object.keys(this.#parser.placeholderMembers) as (keyof Parsed & string)[]).map((member) => [
                            member,
                            {
                                configurable: true,
                                enumerable: true,
                                get() {
                                    throw new NavigationSkippedError(
                                        `The \`${member}\` property is not available - \`skipNavigation\` was used`,
                                        { cause: err },
                                    );
                                },
                            },
                        ]),
                    ),
                ) as Parsed;
            }

            throw err;
        }
    }

    async #addHelpers(context: InternalHttpCrawlingContext & Parsed) {
        const { addRequests } = context;
        const parser = this.#parser;

        const extractLinks = async (options?: ExtractLinksOptions): Promise<string[]> =>
            parser.extractLinks(
                context,
                options?.selector ?? 'a',
                options?.baseUrl ?? context.request.loadedUrl ?? context.request.url,
            );

        const waitForSelector = async (selector: string, timeoutMs = 5_000): Promise<void> => {
            let remaining = parser.mutable ? timeoutMs : 0;

            while ((await parser.select(context, selector)).length === 0) {
                if (remaining <= 0) {
                    throw new Error(`Selector '${selector}' not found.`);
                }

                await sleep(50);
                remaining -= 50;
            }
        };

        return {
            extractLinks,
            waitForSelector,
            enqueueLinks: async (options: EnqueueLinksOptions = {}) => {
                const baseUrl = resolveBaseUrlForEnqueueLinksFiltering({
                    enqueueStrategy: options.strategy,
                    finalRequestUrl: context.request.loadedUrl,
                    originalRequestUrl: context.request.url,
                    userProvidedBaseUrl: options.baseUrl,
                });

                const urls = await extractLinks(options);

                return addRequests(urls, {
                    ...options,
                    baseUrl,
                    strategy: options.strategy ?? EnqueueStrategy.SameHostname,
                });
            },
            async parseWithCheerio(selector?: string, _timeoutMs = 5_000) {
                const $ = (await parser.toCheerio?.(context)) ?? (await import('cheerio')).load(context.body);

                if (selector && $(selector).get().length === 0) {
                    throw new Error(`Selector '${selector}' not found.`);
                }

                return $;
            },
        };
    }
}
