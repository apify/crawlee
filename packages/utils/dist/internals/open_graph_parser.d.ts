import type { Dictionary } from '@crawlee/types';
import type { CheerioAPI } from 'cheerio';
export interface OpenGraphProperty {
    name: string;
    outputName: string;
    children: OpenGraphProperty[];
}
type OpenGraphResult = string | string[] | Dictionary<string | Dictionary>;
/**
 * Easily parse all OpenGraph properties from a page with just a `CheerioAPI` object.
 *
 * @param $ A `CheerioAPI` object, or a string of raw HTML.
 * @param additionalProperties Any potential additional `OpenGraphProperty` items you'd like to be scraped.
 * Currently existing properties are kept up to date.
 * @returns Scraped OpenGraph properties as an object.
 */
export declare function parseOpenGraph(raw: string, additionalProperties?: OpenGraphProperty[]): Dictionary<OpenGraphResult>;
export declare function parseOpenGraph($: CheerioAPI, additionalProperties?: OpenGraphProperty[]): Dictionary<OpenGraphResult>;
export {};
//# sourceMappingURL=open_graph_parser.d.ts.map