import type { DomParser, InternalHttpCrawlingContext } from '@crawlee/http';
import type { CrawleeLogger } from '@crawlee/types';
import { tryAbsoluteURL } from '@crawlee/utils/internal';
import type { DOMWindow, VirtualConsole } from 'jsdom';
import { JSDOM, ResourceLoader } from 'jsdom';

import { addTimeoutToPromise } from '@apify/timeout';

const resources = new ResourceLoader({
    // Copy from /packages/browser-pool/src/abstract-classes/browser-plugin.ts:17
    // in order not to include the entire package here
    userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36',
});

export interface JSDOMParseResult {
    window: DOMWindow;
    document: Document;
    body: string;
}

export interface JsdomParserOptions {
    /**
     * Download and run scripts.
     */
    runScripts?: boolean;

    /**
     * Resolves the `VirtualConsole` to hand to JSDOM. Called for every parse, so a crawler can create its console
     * lazily. Defaults to JSDOM's own console handling.
     */
    virtualConsole?: () => VirtualConsole;

    /**
     * Resolves the logger for JSDOM diagnostics. Called only when there is something to log, so a crawler can hand
     * over its own logger.
     */
    log?: () => CrawleeLogger;
}

/**
 * A {@apilink DomParser} backed by [jsdom](https://www.npmjs.com/package/jsdom). Pass it to a
 * {@apilink DomCrawler} to get the crawling context {@apilink JSDOMCrawler} provides.
 */
export function jsdomParser(options: JsdomParserOptions = {}): DomParser<JSDOMParseResult> {
    const { runScripts = false, virtualConsole, log } = options;

    return {
        members: ['window', 'document', 'body'],
        async parse(context: InternalHttpCrawlingContext) {
            const isXml = context.contentType.type.includes('xml');

            // TODO handle non-string
            const { window } = new JSDOM(context.body.toString(), {
                url: context.response.url,
                contentType: isXml ? 'text/xml' : 'text/html',
                runScripts: runScripts ? 'dangerously' : undefined,
                resources,
                virtualConsole: virtualConsole?.(),
                pretendToBeVisual: true,
            });

            // add some stubs in place of missing API so processing won't fail
            Object.defineProperty(window, 'matchMedia', {
                writable: true,
                value: (query: unknown): any => ({
                    matches: false,
                    media: query,
                    onchange: null,
                    addListener: () => {},
                    removeListener: () => {},
                    addEventListener: () => {},
                    removeEventListener: () => {},
                    dispatchEvent: () => {},
                }),
            });
            window.document.createRange = () => {
                const range = new window.Range();
                range.getBoundingClientRect = () => ({}) as any;
                range.getClientRects = () => ({ item: () => null as any, length: 0 }) as any;
                return range;
            };

            if (runScripts) {
                try {
                    await addTimeoutToPromise(
                        async () => {
                            return new Promise<void>((resolve) => {
                                window.addEventListener(
                                    'load',
                                    () => {
                                        resolve();
                                    },
                                    false,
                                );
                            }).catch();
                        },
                        10_000,
                        'Window.load event not fired after 10 seconds.',
                    ).catch();
                } catch (e) {
                    log?.().debug((e as Error).message);
                }
            }

            return {
                window,
                get body() {
                    return window.document.documentElement.outerHTML;
                },
                get document() {
                    return window.document;
                },
            };
        },
        extractLinks: ({ window }, selector, baseUrl) => extractUrlsFromWindow(window, selector, baseUrl),
        select: ({ document }, selector) => document.querySelectorAll(selector),
        cleanup: ({ window }) => window.close(),
    };
}

/**
 * Extracts URLs from a given Window object.
 * @ignore
 */
function extractUrlsFromWindow(window: DOMWindow, selector: string, baseUrl: string): string[] {
    return Array.from(window.document.querySelectorAll(selector))
        .map((e: any) => e.href)
        .filter((href) => href !== undefined && href !== '')
        .map((href: string | undefined) => {
            if (href === undefined) {
                return undefined;
            }
            return tryAbsoluteURL(href, baseUrl);
        })
        .filter((href) => href !== undefined && href !== '') as string[];
}
