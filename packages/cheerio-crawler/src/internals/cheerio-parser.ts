import type { DOMParser, InternalHttpCrawlingContext } from '@crawlee/http';
import { extractUrlsFromCheerio } from '@crawlee/utils/internal';
import type { CheerioAPI, CheerioOptions } from 'cheerio';
// We parse with htmlparser2, not with cheerio's default parse5: parse5 is a strict HTML5 parser with no
// XML mode, so it mangles the XML/RSS/Atom feeds this parser also serves (`<link>` is a void element in
// HTML, CDATA is not recognised, self-closing unknown tags swallow their siblings). It is also stricter
// than htmlparser2 on broken markup, which is the norm when scraping.
// The slim entrypoint is the htmlparser2-only build, so it additionally keeps `parse5` and - because
// cheerio declares `undici` for its unused `fromURL()` helper - ~1 MB of `undici` out of the module graph.
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
export function cheerioParser(): DOMParser<CheerioParseResult> {
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
        select: ({ $ }, selector) => $(selector).get(),
        toCheerio: ({ $ }) => $,
    };
}
