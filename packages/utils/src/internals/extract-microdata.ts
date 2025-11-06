import type { Dictionary } from '@crawlee/types';
import type { CheerioAPI } from 'cheerio';
import { load } from 'cheerio';

/**
 * Extract schema.org microdata from an HTML document using Cheerio.
 *
 * @param $ A `CheerioAPI` instance OR raw HTML string.
 * @returns Extracted metadata as a Dictionary.
 */
export function extractMicrodata(raw: string): Dictionary<any>;
export function extractMicrodata($: CheerioAPI): Dictionary<any>;
export function extractMicrodata(_item: CheerioAPI | string): Dictionary<any> {
    const $ = typeof _item === 'string' ? load(_item) : _item;

    const extractValue = (elem: any) => {
        return $(elem).attr('content') || $(elem).text()?.trim() || $(elem).attr('src') || $(elem).attr('href') || null;
    };

    const addProperty = (obj: any, propName: string, value: any) => {
        if (typeof value === 'string') value = value.trim();

        if (Array.isArray(obj[propName])) {
            obj[propName].push(value);
        } else if (obj[propName] !== undefined) {
            obj[propName] = [obj[propName], value];
        } else {
            obj[propName] = value;
        }
    };

    const extractItem = (elem: any): any => {
        const item: any = { _type: $(elem).attr('itemtype') };
        let count = 0;

        $(elem)
            .find('[itemprop]')
            .filter(function () {
                return $(this).parentsUntil(elem, '[itemscope]').length === 0;
            })
            .each(function () {
                const propName = $(this).attr('itemprop');

                const value = $(this).is('[itemscope]') ? extractItem(this) : extractValue(this);

                addProperty(item, propName as string, value);
                count++;
            });

        if (count === 0) {
            addProperty(item, '_value', extractValue(elem));
        }

        return item;
    };

    const extractAllItems = () => {
        const items: any[] = [];

        $('[itemscope]')
            .filter(function () {
                return $(this).parentsUntil('body', '[itemscope]').length === 0;
            })
            .each(function () {
                items.push(extractItem(this));
            });

        return items;
    };

    return extractAllItems();
}
