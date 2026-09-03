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
 * The minimum a {@apilink DomParser} has to contribute to the crawling context - the serialized document, used by
 * the {@apilink DomCrawlingContext.parseWithCheerio|`parseWithCheerio`} helper.
 */
export interface DomParseResult {
    body: string;
}

/**
 * Turns a response body into a DOM representation and knows how to query it. Passing one to {@apilink DomCrawler}
 * is what makes the crawler jsdom-based, linkedom-based, or based on a DOM implementation of your own.
 *
 * **Example usage:**
 * ```ts
 * import { DomCrawler } from 'crawlee';
 * import { linkedomParser } from '@crawlee/linkedom';
 *
 * const crawler = new DomCrawler({
 *     parser: linkedomParser(),
 *     async requestHandler({ window }) {
 *         // ...
 *     },
 * });
 * ```
 */
export interface DomParser<Parsed extends DomParseResult> {
    /**
     * The context members {@apilink DomParser.parse|`parse`} contributes. Used to build the placeholders that
     * report a helpful error when the members are accessed after `skipNavigation`.
     */
    readonly members: readonly (keyof Parsed & string)[];

    parse(context: InternalHttpCrawlingContext): Awaitable<Parsed>;

    /**
     * Returns the URLs the `selector` matches, resolved against `baseUrl`.
     */
    extractLinks(parsed: Parsed, selector: string, baseUrl: string): Awaitable<string[]>;

    /**
     * Returns the current matches of `selector`. Only the count is used, by
     * {@apilink DomCrawlingContext.waitForSelector|`waitForSelector`}.
     */
    select(parsed: Parsed, selector: string): Awaitable<ArrayLike<unknown>>;

    /**
     * Releases whatever {@apilink DomParser.parse|`parse`} allocated. Called after the request handler finishes or
     * fails, and skipped entirely when navigation was skipped.
     */
    cleanup?(parsed: Parsed): Awaitable<void>;
}

export interface DomCrawlingHelpers {
    /**
     * Extracts URLs from the parsed DOM, without adding them to the request queue.
     */
    extractLinks(options?: ExtractLinksOptions): Promise<string[]>;

    /**
     * Helper function for extracting URLs from the parsed DOM and adding them to the request queue.
     */
    enqueueLinks(options?: EnqueueLinksOptions): Promise<AddRequestsBatchedResult>;

    /**
     * Wait for an element matching the selector to appear.
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

export type DomCrawlingContext<
    Parsed extends DomParseResult = DomParseResult,
    UserData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
    JSONData extends Dictionary = any, // with default to Dictionary we cant use a typed router in untyped crawler
> = InternalHttpCrawlingContext<UserData, JSONData> & Parsed & DomCrawlingHelpers;

export interface DomCrawlerOptions<
    Parsed extends DomParseResult = DomParseResult,
    ContextExtension = Dictionary<never>,
    ExtendedContext extends DomCrawlingContext<Parsed> = DomCrawlingContext<Parsed> & ContextExtension,
    Routes extends Record<keyof Routes, Dictionary> = Record<string, any>,
    StatisticStateExtension extends object = {},
> extends HttpCrawlerOptions<
    DomCrawlingContext<Parsed>,
    ContextExtension,
    ExtendedContext,
    Routes,
    StatisticStateExtension
> {
    /**
     * The DOM implementation to parse the response bodies with. Its parse result becomes part of the crawling
     * context, so the members the request handler receives follow from the parser you pass.
     */
    parser: DomParser<Parsed>;
}

/**
 * An {@apilink HttpCrawler} that parses each response into a DOM using the {@apilink DomCrawlerOptions.parser|`parser`}
 * it is given, and exposes the parse result plus the {@apilink DomCrawlingContext.enqueueLinks|`enqueueLinks`} and
 * {@apilink DomCrawlingContext.extractLinks|`extractLinks`} helpers on the crawling context.
 *
 * {@apilink JSDOMCrawler} and {@apilink LinkeDOMCrawler} are this crawler with a parser already chosen.
 *
 * @category Crawlers
 */
export class DomCrawler<
    Parsed extends DomParseResult = DomParseResult,
    ContextExtension = Dictionary<never>,
    ExtendedContext extends DomCrawlingContext<Parsed> = DomCrawlingContext<Parsed> & ContextExtension,
    Routes extends Record<keyof Routes, Dictionary> = Record<
        string,
        GetUserDataFromRequest<DomCrawlingContext<Parsed>['request']>
    >,
    StatisticStateExtension extends object = {},
> extends HttpCrawler<DomCrawlingContext<Parsed>, ContextExtension, ExtendedContext, Routes, StatisticStateExtension> {
    readonly #parser: DomParser<Parsed>;

    constructor(
        options: DomCrawlerOptions<Parsed, ContextExtension, ExtendedContext, Routes, StatisticStateExtension>,
    ) {
        const { parser, contextPipelineBuilder, ...rest } = options;

        super({
            ...rest,
            contextPipelineBuilder: contextPipelineBuilder ?? (() => this.buildContextPipeline()),
        });

        this.#parser = parser;
    }

    protected override buildContextPipeline(): ContextPipeline<CrawlingContext, DomCrawlingContext<Parsed>> {
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
                        this.#parser.members.map((member) => [
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
            let remaining = timeoutMs;

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
                const cheerio = await import('cheerio');
                const $ = cheerio.load(context.body);

                if (selector && $(selector).get().length === 0) {
                    throw new Error(`Selector '${selector}' not found.`);
                }

                return $;
            },
        };
    }
}
