import { describe, expect, it } from 'vitest';
import { load } from 'cheerio';

import { extractStructuredData } from '../src/internals/structured-data';

describe('extractStructuredData', () => {
    it('extracts JSON-LD objects and arrays', async () => {
        const result = await extractStructuredData(`
            <script type="application/ld+json">
                {"@context":"https://schema.org","@type":"Article","headline":"Hello"}
            </script>
            <script type="application/ld+json; charset=utf-8">
                [{"@type":"BreadcrumbList"},{"@type":"WebPage","name":"Docs"}]
            </script>
        `);

        expect(result.jsonLd).toEqual([
            { '@context': 'https://schema.org', '@type': 'Article', headline: 'Hello' },
            { '@type': 'BreadcrumbList' },
            { '@type': 'WebPage', name: 'Docs' },
        ]);
    });

    it('extracts microdata from text and element attributes', async () => {
        const result = await extractStructuredData(`
            <article itemscope itemtype="https://schema.org/Product" itemid="sku-1">
                <h1 itemprop="name">Desk lamp</h1>
                <img itemprop="image" src="/lamp.jpg" alt="Lamp">
                <a itemprop="url" href="/products/lamp">View</a>
                <time itemprop="releaseDate" datetime="2026-08-29">Today</time>
                <meta itemprop="sku" content="LAMP-1">
                <data itemprop="price" value="19.99">$19.99</data>
            </article>
        `);

        expect(result.microdata).toEqual([
            {
                type: ['https://schema.org/Product'],
                id: 'sku-1',
                properties: {
                    name: 'Desk lamp',
                    image: '/lamp.jpg',
                    url: '/products/lamp',
                    releaseDate: '2026-08-29',
                    sku: 'LAMP-1',
                    price: '19.99',
                },
            },
        ]);
    });

    it('keeps nested itemscopes as nested property values', async () => {
        const result = await extractStructuredData(`
            <div itemscope itemtype="https://schema.org/Product">
                <span itemprop="name">Coffee</span>
                <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
                    <meta itemprop="priceCurrency" content="USD">
                    <span itemprop="price">12</span>
                </div>
            </div>
        `);

        expect(result.microdata).toEqual([
            {
                type: ['https://schema.org/Product'],
                properties: {
                    name: 'Coffee',
                    offers: {
                        type: ['https://schema.org/Offer'],
                        properties: {
                            priceCurrency: 'USD',
                            price: '12',
                        },
                    },
                },
            },
        ]);
    });

    it('supports itemref properties outside of the item subtree', async () => {
        const result = await extractStructuredData(`
            <div itemscope itemtype="https://schema.org/Person" itemref="external-name external-url">
                <span itemprop="jobTitle">Engineer</span>
            </div>
            <p id="external-name" itemprop="name">Ada Lovelace</p>
            <a id="external-url" itemprop="url" href="https://example.com/ada">Profile</a>
        `);

        expect(result.microdata).toEqual([
            {
                type: ['https://schema.org/Person'],
                properties: {
                    jobTitle: 'Engineer',
                    name: 'Ada Lovelace',
                    url: 'https://example.com/ada',
                },
            },
        ]);
    });

    it('accepts an existing Cheerio object', async () => {
        const $ = load('<div itemscope><span itemprop="name">Existing DOM</span></div>');
        const result = await extractStructuredData($);

        expect(result.microdata).toEqual([
            {
                properties: {
                    name: 'Existing DOM',
                },
            },
        ]);
    });
});
