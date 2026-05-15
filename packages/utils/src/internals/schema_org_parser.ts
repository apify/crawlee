import type { Dictionary } from '@crawlee/types';
import { load, type CheerioAPI } from 'cheerio';

/**
 * Represents a schema.org itemprop attribute
 */
export interface SchemaOrgProperty {
    name: string;
    outputName: string;
    children?: SchemaOrgProperty[];
}

/**
 * Result from parsing schema.org microdata
 */
type SchemaOrgResult = string | string[] | Dictionary<string | Dictionary> | SchemaOrgResult[];

/**
 * Extracts the value from a microdata element based on its itemprop
 */
const getValue = ($: CheerioAPI, elem: any): string | string[] => {
    // Check for content attribute first
    const content = $(elem).attr('content');
    if (content) return content;

    // Check for src for media elements
    const src = $(elem).attr('src');
    if (src) return src;

    // Check for href for link elements
    const href = $(elem).attr('href');
    if (href) return href;

    // Check for datetime for time elements
    const datetime = $(elem).attr('datetime');
    if (datetime) return datetime;

    // Check for value for data elements
    const value = $(elem).attr('value');
    if (value) return value;

    // For meta elements without recognized attributes, return empty
    if ($(elem).is('meta')) return '';

    // For other elements, return text content
    return $(elem).text().trim();
};

/**
 * Parse a single schema.org property
 */
const parseSchemaProperty = (property: SchemaOrgProperty, $: CheerioAPI): SchemaOrgResult => {
    // Handle both itemprop attribute and meta elements
    const selector = property.name.startsWith('http') 
        ? `[itemprop="${property.name}"]`
        : `[itemprop="${property.name}"]`;
    
    const elements = [...$(selector)];
    
    if (elements.length === 0) return '';
    
    if (elements.length === 1) {
        const value = getValue($, elements[0]);
        
        if (!property.children || property.children.length === 0) {
            return value;
        }
        
        // Handle nested properties
        const nested: Dictionary<string | Dictionary> = {};
        for (const child of property.children) {
            const childResult = parseSchemaProperty(child, $);
            if (childResult) {
                nested[child.outputName] = childResult as string;
            }
        }
        
        return Object.keys(nested).length > 0 
            ? { value, ...nested } 
            : value;
    }
    
    // Multiple elements - return array
    return elements.map((elem) => {
        const value = getValue($, elem);
        
        if (!property.children || property.children.length === 0) {
            return value;
        }
        
        const nested: Dictionary<string | Dictionary> = {};
        for (const child of property.children) {
            const childResult = parseSchemaProperty(child, $);
            if (childResult) {
                nested[child.outputName] = childResult as string;
            }
        }
        
        return Object.keys(nested).length > 0 
            ? { value, ...nested } 
            : value;
    });
};

/**
 * Common schema.org types and their properties
 */
export const SCHEMA_ORG_PROPERTIES: SchemaOrgProperty[] = [
    {
        name: 'name',
        outputName: 'name',
    },
    {
        name: 'description',
        outputName: 'description',
    },
    {
        name: 'url',
        outputName: 'url',
    },
    {
        name: 'image',
        outputName: 'image',
    },
    {
        name: 'logo',
        outputName: 'logo',
    },
    {
        name: 'price',
        outputName: 'price',
    },
    {
        name: 'priceCurrency',
        outputName: 'priceCurrency',
    },
    {
        name: 'author',
        outputName: 'author',
    },
    {
        name: 'publisher',
        outputName: 'publisher',
    },
    {
        name: 'datePublished',
        outputName: 'datePublished',
    },
    {
        name: 'dateModified',
        outputName: 'dateModified',
    },
    {
        name: 'ratingValue',
        outputName: 'ratingValue',
    },
    {
        name: 'bestRating',
        outputName: 'bestRating',
    },
    {
        name: 'worstRating',
        outputName: 'worstRating',
    },
    {
        name: 'reviewCount',
        outputName: 'reviewCount',
    },
    {
        name: 'sku',
        outputName: 'sku',
    },
    {
        name: 'mpn',
        outputName: 'mpn',
    },
    {
        name: 'gtin13',
        outputName: 'gtin13',
    },
    {
        name: 'brand',
        outputName: 'brand',
    },
    {
        name: 'aggregateRating',
        outputName: 'aggregateRating',
        children: [
            { name: 'ratingValue', outputName: 'ratingValue' },
            { name: 'reviewCount', outputName: 'reviewCount' },
            { name: 'bestRating', outputName: 'bestRating' },
            { name: 'worstRating', outputName: 'worstRating' },
        ],
    },
    {
        name: 'offers',
        outputName: 'offers',
        children: [
            { name: 'price', outputName: 'price' },
            { name: 'priceCurrency', outputName: 'priceCurrency' },
            { name: 'availability', outputName: 'availability' },
            { name: 'priceValidUntil', outputName: 'priceValidUntil' },
        ],
    },
    {
        name: 'itemListElement',
        outputName: 'itemListElement',
    },
];

/**
 * Extract all itemscope items from the page
 */
const extractItems = ($: CheerioAPI): Dictionary<SchemaOrgResult>[] => {
    const items: Dictionary<SchemaOrgResult>[] = [];
    
    $('[itemscope]').each((_, elem) => {
        const item: Dictionary<SchemaOrgResult> = {};
        
        // Get itemtype
        const itemtype = $(elem).attr('itemtype');
        if (itemtype) {
            item.itemtype = itemtype;
        }
        
        // Get all itemprops within this scope
        $(elem).find('[itemprop]').each((_, propElem) => {
            const propName = $(propElem).attr('itemprop');
            if (!propName) return;
            
            const value = getValue($, propElem);
            
            // Check for nested itemscope
            if ($(propElem).find('[itemscope]').length > 0) {
                // Handle nested objects
                const nestedItems = $(propElem).find('[itemscope]').map((_, nested) => {
                    const nestedItem: Dictionary<SchemaOrgResult> = {};
                    $(nested).find('[itemprop]').each((_, np) => {
                        const npName = $(np).attr('itemprop');
                        if (npName) {
                            nestedItem[npName] = getValue($, np);
                        }
                    });
                    return nestedItem;
                }).get();
                
                if (nestedItems.length > 0) {
                    item[propName] = nestedItems;
                }
            } else {
                // Simple value
                if (item[propName]) {
                    // Already exists - convert to array
                    const existing = item[propName];
                    if (Array.isArray(existing)) {
                        existing.push(value);
                    } else {
                        item[propName] = [existing, value];
                    }
                } else {
                    item[propName] = value;
                }
            }
        });
        
        items.push(item);
    });
    
    return items;
};

/**
 * Easily parse all Schema.org microdata from a page with just a `CheerioAPI` object or raw HTML.
 *
 * @param $ A `CheerioAPI` object, or a string of raw HTML.
 * @param additionalProperties Any potential additional Schema.org properties you'd like to be scraped.
 * @returns Scraped Schema.org microdata as an object with extracted items.
 */
export function parseSchemaOrg(raw: string, additionalProperties?: SchemaOrgProperty[]): Dictionary<SchemaOrgResult>;
export function parseSchemaOrg($: CheerioAPI, additionalProperties?: SchemaOrgProperty[]): Dictionary<SchemaOrgResult>;
export function parseSchemaOrg(item: CheerioAPI | string, additionalProperties?: SchemaOrgProperty[]) {
    const $ = typeof item === 'string' ? load(item) : item;

    // Extract all itemscope items
    const items = extractItems($);
    
    // Also extract common properties globally (outside itemscope)
    const globalProps: Dictionary<SchemaOrgResult> = {};
    const propsToCheck = [...(additionalProperties || []), ...SCHEMA_ORG_PROPERTIES];
    
    for (const property of propsToCheck) {
        const result = parseSchemaProperty(property, $);
        if (result) {
            globalProps[property.outputName] = result;
        }
    }

    return {
        items,
        properties: globalProps,
    };
}
