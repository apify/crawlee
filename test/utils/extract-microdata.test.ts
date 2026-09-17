import { extractMicrodata } from '@crawlee/utils';
import { load } from 'cheerio';

describe('extractMicrodata', () => {
    it('returns no items for a document without microdata', async () => {
        expect(await extractMicrodata('<p>Nothing to see here</p>')).toEqual([]);
    });

    it('accepts a CheerioAPI object', async () => {
        const $ = load('<div itemscope><span itemprop="name">Existing DOM</span></div>');

        expect(await extractMicrodata($)).toEqual([{ properties: { name: 'Existing DOM' } }]);
    });

    it('splits itemtype and itemprop token sets', async () => {
        const items = await extractMicrodata(`
            <div itemscope itemtype="https://schema.org/Product https://schema.org/Thing" itemid="urn:isbn:1">
                <span itemprop="favorite-color favorite-fruit">orange</span>
            </div>`);

        expect(items).toEqual([
            {
                type: ['https://schema.org/Product', 'https://schema.org/Thing'],
                id: 'urn:isbn:1',
                properties: { 'favorite-color': 'orange', 'favorite-fruit': 'orange' },
            },
        ]);
    });

    it('reads the value from the attribute belonging to each element type', async () => {
        const items = await extractMicrodata(`
            <div itemscope>
                <meta itemprop="sku" content="LAMP-1">
                <img itemprop="image" src="/lamp.jpg" alt="A lamp">
                <a itemprop="url" href="/products/lamp">View the lamp</a>
                <time itemprop="releaseDate" datetime="2026-08-29">Yesterday</time>
                <data itemprop="price" value="19.99">$19.99</data>
                <meter itemprop="rating" value="4.5">Great</meter>
                <object itemprop="model" data="/lamp.glb">A 3D model</object>
                <p itemprop="description">  Collapses   any
                    inner whitespace  </p>
                <a itemprop="permalink">Not a link</a>
            </div>`);

        expect(items[0].properties).toEqual({
            sku: 'LAMP-1',
            image: '/lamp.jpg',
            url: '/products/lamp',
            releaseDate: '2026-08-29',
            price: '19.99',
            rating: '4.5',
            model: '/lamp.glb',
            description: 'Collapses any inner whitespace',
            permalink: '',
        });
    });

    it('groups a repeated property into an array', async () => {
        const items = await extractMicrodata(`
            <div itemscope>
                <span itemprop="tag">first</span>
                <span itemprop="tag">second</span>
                <span itemprop="tag">third</span>
            </div>`);

        expect(items[0].properties).toEqual({ tag: ['first', 'second', 'third'] });
    });

    it('nests an item used as a property value', async () => {
        const items = await extractMicrodata(`
            <div itemscope itemtype="https://schema.org/Product">
                <span itemprop="name">Coffee</span>
                <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
                    <meta itemprop="priceCurrency" content="USD">
                    <span itemprop="price">12</span>
                </div>
            </div>`);

        expect(items).toEqual([
            {
                type: ['https://schema.org/Product'],
                properties: {
                    name: 'Coffee',
                    offers: {
                        type: ['https://schema.org/Offer'],
                        properties: { priceCurrency: 'USD', price: '12' },
                    },
                },
            },
        ]);
    });

    it('treats a nested itemscope without itemprop as a separate top-level item', async () => {
        const items = await extractMicrodata(`
            <div itemscope itemtype="https://schema.org/Article">
                <span itemprop="headline">Outer</span>
                <div itemscope itemtype="https://schema.org/Comment">
                    <span itemprop="text">Inner</span>
                </div>
            </div>`);

        expect(items).toEqual([
            { type: ['https://schema.org/Article'], properties: { headline: 'Outer' } },
            { type: ['https://schema.org/Comment'], properties: { text: 'Inner' } },
        ]);
    });

    it('collects properties referenced with itemref', async () => {
        const items = await extractMicrodata(`
            <div itemscope itemtype="https://schema.org/Person" itemref="external-name external-contact">
                <span itemprop="jobTitle">Engineer</span>
            </div>
            <p id="external-name" itemprop="name">Ada Lovelace</p>
            <div id="external-contact">
                <a itemprop="url" href="https://example.com/ada">Profile</a>
            </div>`);

        expect(items).toEqual([
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

    it('stops at an itemref cycle instead of recursing forever', async () => {
        // `loop-a` and `loop-b` reference each other, so the second visit of `loop-a` must be cut short.
        const items = await extractMicrodata(`
            <div itemscope itemref="loop-a">
                <span itemprop="name">root</span>
            </div>
            <div id="loop-a" itemscope itemprop="self" itemref="loop-b">
                <span itemprop="name">a</span>
            </div>
            <div id="loop-b" itemscope itemprop="self" itemref="loop-a">
                <span itemprop="name">b</span>
            </div>`);

        expect(items).toEqual([
            {
                properties: {
                    name: 'root',
                    self: {
                        properties: {
                            name: 'a',
                            self: { properties: { name: 'b', self: { properties: {} } } },
                        },
                    },
                },
            },
        ]);
    });
});
