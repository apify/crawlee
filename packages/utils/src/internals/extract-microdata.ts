import type { CheerioAPI } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import { isTag } from 'domhandler';

/** The value of a microdata property: either text or a nested item. */
export type MicrodataValue = string | MicrodataItem;

/** A single schema.org item extracted from a document. */
export interface MicrodataItem {
    /** Tokens of the item's `itemtype` attribute. */
    type?: string[];
    /** The item's `itemid` attribute. */
    id?: string;
    /** Values keyed by `itemprop` name, an array where the property repeats. */
    properties: Record<string, MicrodataValue | MicrodataValue[]>;
}

interface ExtractionContext {
    $: CheerioAPI;
    /** Built on first `itemref` lookup, which most documents never trigger. */
    idIndex?: Map<string, Element>;
    /** Position of every element in tree order, built alongside `idIndex` for sorting referenced properties. */
    treeOrder?: Map<Element, number>;
}

/**
 * Easily parse all schema.org microdata from a page with just a `CheerioAPI` object or raw HTML,
 * following the [microdata processing model](https://html.spec.whatwg.org/multipage/microdata.html#microdata).
 *
 * Text values are trimmed and their inner whitespace collapsed. URL-valued attributes are returned
 * verbatim rather than resolved against the document's base URL.
 *
 * @param htmlOrCheerioElement A `CheerioAPI` object, or a string of raw HTML.
 * @returns The document's top-level items. Nested items are the property values of their parent.
 */
export async function extractMicrodata(raw: string): Promise<MicrodataItem[]>;
export async function extractMicrodata($: CheerioAPI): Promise<MicrodataItem[]>;
export async function extractMicrodata(htmlOrCheerioElement: string | CheerioAPI): Promise<MicrodataItem[]> {
    // Dynamic so that importing `@crawlee/utils` does not pull in cheerio - see #3836.
    const { load } = await import('cheerio/slim');
    const $ = typeof htmlOrCheerioElement === 'string' ? load(htmlOrCheerioElement) : htmlOrCheerioElement;
    const context: ExtractionContext = { $ };

    return $('[itemscope]')
        .toArray()
        .filter((element) => !('itemprop' in element.attribs) && !isInsideTemplate(element))
        .map((element) => parseItem(context, element, new Set()));
}

function parseItem(context: ExtractionContext, element: Element, ancestors: Set<Element>): MicrodataItem {
    const item: MicrodataItem = { properties: {} };
    const type = uniqueTokens(element.attribs.itemtype);
    const id = element.attribs.itemid;

    if (type.length > 0) {
        item.type = type;
    }

    if (id) {
        item.id = id.trim();
    }

    ancestors.add(element);

    for (const propertyElement of collectPropertyElements(context, element)) {
        const value = getPropertyValue(context, propertyElement, ancestors);

        for (const name of uniqueTokens(propertyElement.attribs.itemprop)) {
            addProperty(item.properties, name, value);
        }
    }

    ancestors.delete(element);

    return item;
}

function collectPropertyElements(context: ExtractionContext, scope: Element): Element[] {
    const elements: Element[] = [];
    // An `itemref` can point at an element already reached from the item's own subtree, or at one that
    // contains another referenced element. The spec visits every element once, so each property counts once.
    const visited = new Set<Element>();

    collectFromNodes(scope.children, elements, visited);

    const ownCount = elements.length;

    for (const id of uniqueTokens(scope.attribs.itemref)) {
        const referenced = (context.idIndex ??= indexIds(context.$)).get(id);

        if (referenced) {
            collectFromNodes([referenced], elements, visited);
        }
    }

    // The spec sorts the crawled properties in tree order, so a referenced element that comes before the
    // item in the document (or a reference listed out of document order) must not end up last.
    if (elements.length > ownCount) {
        const treeOrder = (context.treeOrder ??= indexTreeOrder(context.$));
        elements.sort((a, b) => treeOrder.get(a)! - treeOrder.get(b)!);
    }

    return elements;
}

function collectFromNodes(nodes: AnyNode[], elements: Element[], visited: Set<Element>): void {
    for (const node of nodes) {
        if (!isTag(node) || visited.has(node)) {
            continue;
        }

        visited.add(node);

        if ('itemprop' in node.attribs) {
            elements.push(node);
        }

        // A nested item owns everything below it, so its subtree is not part of the enclosing item.
        // A `<template>`'s content is an inert fragment, not part of the document.
        if (!('itemscope' in node.attribs) && node.tagName.toLowerCase() !== 'template') {
            collectFromNodes(node.children, elements, visited);
        }
    }
}

function indexTreeOrder($: CheerioAPI): Map<Element, number> {
    const order = new Map<Element, number>();

    // Selector results come back in document order.
    for (const element of $('*').toArray()) {
        if (isTag(element)) {
            order.set(element, order.size);
        }
    }

    return order;
}

function indexIds($: CheerioAPI): Map<string, Element> {
    const index = new Map<string, Element>();

    for (const element of $('[id]').toArray()) {
        // Duplicate ids are invalid HTML; `getElementById` resolves them to the first element.
        if (!index.has(element.attribs.id) && !isInsideTemplate(element)) {
            index.set(element.attribs.id, element);
        }
    }

    return index;
}

/**
 * Cheerio keeps a `<template>`'s content as its children, but in the DOM that content is a separate
 * inert fragment, so its items and ids are not part of the document (framework placeholders like
 * `<template x-for>` would otherwise show up as items with empty or `{{ mustache }}` values).
 */
function isInsideTemplate(element: Element): boolean {
    for (let parent = element.parent; parent; parent = parent.parent) {
        if (isTag(parent) && parent.tagName.toLowerCase() === 'template') {
            return true;
        }
    }

    return false;
}

function getPropertyValue(context: ExtractionContext, element: Element, ancestors: Set<Element>): MicrodataValue {
    if ('itemscope' in element.attribs) {
        // `itemref` can point back at an enclosing item, which the spec treats as an error.
        return ancestors.has(element) ? { properties: {} } : parseItem(context, element, ancestors);
    }

    const { attribs } = element;

    switch (element.tagName.toLowerCase()) {
        case 'meta':
            return attribs.content ?? '';
        case 'audio':
        case 'embed':
        case 'iframe':
        case 'img':
        case 'source':
        case 'track':
        case 'video':
            return attribs.src ?? '';
        case 'a':
        case 'area':
        case 'link':
            return attribs.href ?? '';
        case 'object':
            return attribs.data ?? '';
        case 'data':
        case 'meter':
            return attribs.value ?? '';
        case 'time':
            return attribs.datetime ?? context.$(element).text().replace(/\s+/g, ' ').trim();
        default:
            return context.$(element).text().replace(/\s+/g, ' ').trim();
    }
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

/** `itemtype`, `itemprop` and `itemref` are all unordered sets of unique space-separated tokens. */
function uniqueTokens(value: string | undefined): string[] {
    if (!value) {
        return [];
    }

    const tokens = value.split(/\s+/).filter(Boolean);

    return tokens.length > 1 ? [...new Set(tokens)] : tokens;
}
