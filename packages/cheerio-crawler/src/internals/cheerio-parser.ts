import type { DOMParser, InternalHttpCrawlingContext } from '@crawlee/http';
import { extractUrlsFromCheerio } from '@crawlee/utils/internal';
import type { Cheerio, CheerioAPI, CheerioOptions } from 'cheerio';
import type { AnyNode } from 'domhandler';
// slim uses faster htmlparser2 parser and doesn't load extra libs like undici
import * as cheerio from 'cheerio/slim';
import { parseDocument } from 'htmlparser2';

export interface CheerioParseResult {
    $: CheerioAPI;
    body: string;
}

/**
 * A {@apilink DOMParser} backed by [cheerio](https://www.npmjs.com/package/cheerio). Pass it to a
 * {@apilink DOMCrawler} to get the crawling context {@apilink CheerioCrawler} provides.
 */
export function cheerioParser(): DOMParser<CheerioParseResult, Cheerio<AnyNode>, Cheerio<AnyNode>> {
    return {
        placeholderMembers: { $: true, body: true },
        parse(context: InternalHttpCrawlingContext) {
            const isXml = context.contentType.type.includes('xml');
            const body = Buffer.isBuffer(context.body)
                ? context.body.toString(context.contentType.encoding)
                : context.body;
            const dom = parseDocument(body, { decodeEntities: true, xmlMode: isXml });
            const $ = cheerio.load(dom, {
                xml: { decodeEntities: true, xmlMode: isXml },
            } as CheerioOptions);

            return { $, body };
        },
        extractLinks: ({ $ }, selector, baseUrl) => extractUrlsFromCheerio($, selector, baseUrl),
        querySelectorAll: ({ $ }, selector) => $(selector),
        querySelectorOne: ({ $ }, selector) => {
            const match = $(selector).first();
            return match.length ? match : undefined;
        },
        toCheerio: ({ $ }) => $,
    };
}
