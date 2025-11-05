import type { Dictionary } from '@crawlee/types';
import type { CheerioAPI } from 'cheerio';
import { load } from 'cheerio';


/**
 * Extract [schema.org](https://schema.org) microdata from a HTML document using Cheerio.
 *
 * @param $ A `CheerioAPI` object, or a string of raw HTML.
 * @returns Scraped OpenGraph properties as an object.
 */
export function extractMicrodata(raw: string): Dictionary<any>;
export function extractMicrodata($: CheerioAPI): Dictionary<any>;
export function extractMicrodata(item: CheerioAPI | string) {
    const $ = typeof item === 'string' ? load(item) : item;

    return {}
}
