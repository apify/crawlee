import type { DomParser, InternalHttpCrawlingContext } from '@crawlee/http';
import { tryAbsoluteURL } from '@crawlee/utils/internal';
import { DOMParser } from 'linkedom/cached';

export interface LinkeDOMParseResult {
    window: Window;
    // Technically the document is not of type Document but of type either HTMLDocument or XMLDocument
    // from linkedom/types/{html/xml}/document, depending on the content type of the response
    // Using union of the real types would make writing the crawlers inconvenient,
    // so we specify the type as the native Document type from lib.dom.d.ts
    // even though it's not technically 100% correct
    document: Document;
    body: string;
}

/**
 * A {@apilink DomParser} backed by [linkedom](https://www.npmjs.com/package/linkedom). Pass it to a
 * {@apilink DomCrawler} to get the crawling context {@apilink LinkeDOMCrawler} provides.
 */
export function linkedomParser(): DomParser<LinkeDOMParseResult> {
    const parser = new DOMParser();

    return {
        members: ['window', 'document', 'body'],
        parse(context: InternalHttpCrawlingContext) {
            const isXml = context.contentType.type.includes('xml');
            const document = parser.parseFromString(context.body.toString(), isXml ? 'text/xml' : 'text/html');

            return {
                window: document.defaultView as unknown as Window,
                get body() {
                    return document.documentElement.outerHTML;
                },
                get document() {
                    // See comment about typing in LinkeDOMParseResult definition
                    return document as unknown as Document;
                },
            };
        },
        extractLinks: ({ window }, selector, baseUrl) => extractUrlsFromWindow(window, selector, baseUrl),
        select: ({ document }, selector) => document.querySelectorAll(selector),
    };
}

/**
 * Extracts URLs from a given Window object.
 * @ignore
 */
function extractUrlsFromWindow(window: Window, selector: string, baseUrl: string): string[] {
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
