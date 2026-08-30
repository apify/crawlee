import type { AnyNode, Element } from 'domhandler';
import type { CheerioAPI } from 'cheerio';

export type MicrodataValue = string | MicrodataItem;

export interface MicrodataItem {
    type?: string[];
    id?: string;
    properties: Record<string, MicrodataValue | MicrodataValue[]>;
}

export interface StructuredData {
    jsonLd: unknown[];
    microdata: MicrodataItem[];
}

const URL_VALUE_TAGS = new Set(['a', 'area', 'link']);
const SRC_VALUE_TAGS = new Set(['audio', 'embed', 'iframe', 'img', 'source', 'track', 'video']);

/**
 * Extracts schema.org structured data from HTML.
 *
 * The helper reads JSON-LD scripts and microdata (`itemscope` / `itemprop`) from
 * the same document. Pass an existing Cheerio object to avoid parsing HTML twice.
 */
export async function extractStructuredData(htmlOrCheerioElement: string | CheerioAPI): Promise<StructuredData> {
    const { load } = await import('cheerio');
    const $ = typeof htmlOrCheerioElement === 'function' ? htmlOrCheerioElement : load(htmlOrCheerioElement);

    return {
        jsonLd: extractJsonLd($),
        microdata: extractMicrodata($),
    };
}

function extractJsonLd($: CheerioAPI): unknown[] {
    return $('script[type]')
        .toArray()
        .filter((element) => {
            const type = ($(element).attr('type') ?? '').toLowerCase().split(';', 1)[0].trim();
            return type === 'application/ld+json';
        })
        .flatMap((element) => {
            const json = $(element).text().trim();

            if (!json) {
                return [];
            }

            try {
                const parsed = JSON.parse(json) as unknown;
                return Array.isArray(parsed) ? parsed : [parsed];
            } catch {
                return [];
            }
        });
}

function extractMicrodata($: CheerioAPI): MicrodataItem[] {
    return $('[itemscope]')
        .toArray()
        .filter((element) => !$(element).is('[itemprop]'))
        .map((element) => parseMicrodataItem($, element));
}

function parseMicrodataItem($: CheerioAPI, element: Element, seen = new Set<Element>()): MicrodataItem {
    if (seen.has(element)) {
        return { properties: {} };
    }

    seen.add(element);

    return {
        ...optionalArray('type', splitAttribute($(element).attr('itemtype'))),
        ...optionalString('id', $(element).attr('itemid')),
        properties: collectProperties($, element, seen),
    };
}

function collectProperties(
    $: CheerioAPI,
    scopeElement: Element,
    seen: Set<Element>,
): Record<string, MicrodataValue | MicrodataValue[]> {
    const properties: Record<string, MicrodataValue | MicrodataValue[]> = {};
    const propertyElements = collectPropertyElements($, scopeElement);

    for (const element of propertyElements) {
        const names = splitAttribute($(element).attr('itemprop'));
        const value = getPropertyValue($, element, seen);

        for (const name of names) {
            addProperty(properties, name, value);
        }
    }

    return properties;
}

function collectPropertyElements($: CheerioAPI, scopeElement: Element): Element[] {
    const elements: Element[] = [];
    const itemRefs = splitAttribute($(scopeElement).attr('itemref'));

    collectPropertyElementsFromNodes($, $(scopeElement).children().toArray(), elements);

    for (const id of itemRefs) {
        const referencedElement = $(`#${escapeSelector(id)}`).get(0);

        if (referencedElement) {
            collectPropertyElementsFromNodes($, [referencedElement], elements);
        }
    }

    return elements;
}

function collectPropertyElementsFromNodes($: CheerioAPI, nodes: AnyNode[], elements: Element[]): void {
    for (const node of nodes) {
        if (node.type !== 'tag') {
            continue;
        }

        const element = node;
        const isItemScope = $(element).is('[itemscope]');

        if ($(element).is('[itemprop]')) {
            elements.push(element);
        }

        if (isItemScope) {
            continue;
        }

        collectPropertyElementsFromNodes($, $(element).children().toArray(), elements);
    }
}

function getPropertyValue($: CheerioAPI, element: Element, seen: Set<Element>): MicrodataValue {
    const tagName = element.tagName.toLowerCase();

    if ($(element).is('[itemscope]')) {
        return parseMicrodataItem($, element, new Set(seen));
    }

    if (tagName === 'meta') {
        return $(element).attr('content') ?? '';
    }

    if (SRC_VALUE_TAGS.has(tagName)) {
        return $(element).attr('src') ?? '';
    }

    if (URL_VALUE_TAGS.has(tagName)) {
        return $(element).attr('href') ?? '';
    }

    if (tagName === 'object') {
        return $(element).attr('data') ?? '';
    }

    if (tagName === 'data' || tagName === 'meter') {
        return $(element).attr('value') ?? '';
    }

    if (tagName === 'time') {
        return $(element).attr('datetime') ?? normalizeText($(element).text());
    }

    return normalizeText($(element).text());
}

function addProperty(
    properties: Record<string, MicrodataValue | MicrodataValue[]>,
    name: string,
    value: MicrodataValue,
): void {
    const existing = properties[name];

    if (existing === undefined) {
        properties[name] = value;
    } else if (Array.isArray(existing)) {
        existing.push(value);
    } else {
        properties[name] = [existing, value];
    }
}

function splitAttribute(value: string | undefined): string[] {
    return value?.trim().split(/\s+/).filter(Boolean) ?? [];
}

function normalizeText(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
}

function optionalArray(key: string, value: string[]): Record<string, string[]> {
    return value.length > 0 ? { [key]: value } : {};
}

function optionalString(key: string, value: string | undefined): Record<string, string> {
    return value ? { [key]: value } : {};
}

function escapeSelector(value: string): string {
    return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}
