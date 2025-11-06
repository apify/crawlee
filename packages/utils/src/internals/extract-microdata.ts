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
        return (
            $(elem).attr("content") ||
            $(elem).text()?.trim() ||
            $(elem).attr("src") ||
            $(elem).attr("href") ||
            null
        );
    };

    const addProperty = (obj: any, propName: string, value: any) => {
        if (typeof value === "string") value = value.trim();

        if (Array.isArray(obj[propName])) {
            obj[propName].push(value);
        } else if (obj[propName] !== undefined) {
            obj[propName] = [obj[propName], value];
        } else {
            obj[propName] = value;
        }
    };

    const extractItem = (elem: any): any => {
        const item: any = { _type: $(elem).attr("itemtype") };
        let count = 0;

        $(elem)
            .find("[itemprop]")
            .filter(function () {
                return $(this).parentsUntil(elem, "[itemscope]").length === 0;
            })
            .each(function () {
                const propName = $(this).attr("itemprop");

                const value = $(this).is("[itemscope]")
                    ? extractItem(this)
                    : extractValue(this);

                addProperty(item, propName as string, value);
                count++;
            });

        if (count === 0) {
            addProperty(item, "_value", extractValue(elem));
        }

        return item;
    };

    const extractAllItems = () => {
        const items: any[] = [];

        $("[itemscope]")
            .filter(function () {
                return $(this).parentsUntil("body", "[itemscope]").length === 0;
            })
            .each(function () {
                items.push(extractItem(this));
            });

        return items;
    };

    return extractAllItems();
}


const result = extractMicrodata(`
<div itemscope itemtype="http://schema.org/Product">
    <meta itemprop="sku" content="ABC-123" />

    <span itemprop="name">Wireless Noise-Cancelling Headphones</span>
    
    <img itemprop="image" src="https://example.com/img/headphones.jpg">

    <div itemprop="brand" itemscope itemtype="http://schema.org/Brand">
        <span itemprop="name">SoundMax</span>
        <meta itemprop="logo" content="https://example.com/logo.png">
    </div>

    <div itemprop="aggregateRating" itemscope itemtype="http://schema.org/AggregateRating">
        <meta itemprop="ratingValue" content="4.6">
        <meta itemprop="reviewCount" content="245">
    </div>

    <div itemprop="offers" itemscope itemtype="http://schema.org/Offer">
        <link itemprop="url" href="https://example.com/products/abc-123">
        <meta itemprop="priceCurrency" content="USD">
        <meta itemprop="price" content="199.99">
        <meta itemprop="availability" content="http://schema.org/InStock">
    </div>

    <!-- Multiple reviews -->
    <div itemprop="review" itemscope itemtype="http://schema.org/Review">
        <span itemprop="author">Alice</span>
        <meta itemprop="datePublished" content="2024-02-01">
        <div itemprop="reviewBody">Great sound quality and battery life.</div>

        <div itemprop="reviewRating" itemscope itemtype="http://schema.org/Rating">
            <meta itemprop="ratingValue" content="5">
            <meta itemprop="bestRating" content="5">
        </div>
    </div>

    <div itemprop="review" itemscope itemtype="http://schema.org/Review">
        <span itemprop="author">Mark</span>
        <meta itemprop="datePublished" content="2024-01-15">
        <div itemprop="reviewBody">Comfortable but slightly expensive.</div>

        <div itemprop="reviewRating" itemscope itemtype="http://schema.org/Rating">
            <meta itemprop="ratingValue" content="4">
            <meta itemprop="bestRating" content="5">
        </div>
    </div>
</div>

`);

console.log(result);
