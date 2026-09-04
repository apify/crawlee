import type { DomParser, InternalHttpCrawlingContext } from '@crawlee/http';
import { extractUrlsFromCheerio } from '@crawlee/utils/internal';
import type { CheerioAPI, CheerioOptions } from 'cheerio';
import * as cheerio from 'cheerio';
import { parseDocument } from 'htmlparser2';

export interface CheerioParseResult {
    $: CheerioAPI;
    body: string;
}

/**
 * A {@apilink DomParser} backed by [cheerio](https://www.npmjs.com/package/cheerio). Pass it to a
 * {@apilink DomCrawler} to get the crawling context {@apilink CheerioCrawler} provides.
 */
export function cheerioParser(): DomParser<CheerioParseResult> {
    return {
        members: ['$', 'body'],
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
        select: ({ $ }, selector) => $(selector).get(),
        toCheerio: ({ $ }) => $,
    };
}
