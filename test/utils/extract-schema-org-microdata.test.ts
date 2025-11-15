import { JSDOM } from 'jsdom';
import { extractSchemaOrgMicrodata } from '../../packages/utils/src/internals/extract-schema-org-microdata';

describe('extractSchemaOrgMicrodata', () => {
    function loadDOM(html: string) {
        const dom = new JSDOM(html);
        return dom.window.document;
    }

    test('Extracts simple microdata item with title', () => {
        const document = loadDOM(`
            <div itemscope itemtype="http://schema.org/Product">
                <span itemprop="name">Example Product</span>
            </div>
        `);
        global.document = document;

        const data = extractSchemaOrgMicrodata();
        expect(data).toEqual([
            {
                _type: 'http://schema.org/Product',
                name: 'Example Product',
            },
        ]);
    });

    test('Handles nested itemscope and multiple itemprops', () => {
        const document = loadDOM(`
            <div itemscope itemtype="http://schema.org/Movie">
                <span itemprop="name">Inception</span>
                <div itemprop="director" itemscope itemtype="http://schema.org/Person">
                    <span itemprop="name">Christopher Nolan</span>
                </div>
            </div>
        `);
        global.document = document;

        const data = extractSchemaOrgMicrodata();
        expect(data).toEqual([
            {
                _type: 'http://schema.org/Movie',
                name: 'Inception',
                director: {
                    _type: 'http://schema.org/Person',
                    name: 'Christopher Nolan',
                },
            },
        ]);
    });

    test('Adds _value fallback when no child properties', () => {
        const document = loadDOM(`
            <div itemscope itemtype="http://schema.org/Thing">
                Some plain text content without itemprop
            </div>
        `);
        global.document = document;

        const data = extractSchemaOrgMicrodata();
        expect(data).toEqual([
            {
                _type: 'http://schema.org/Thing',
                _value: 'Some plain text content without itemprop',
            },
        ]);
    });

    test('Handles multiple itemprop with same name as array', () => {
        const document = loadDOM(`
            <div itemscope itemtype="http://schema.org/TVSeries">
                <span itemprop="actor">Actor 1</span>
                <span itemprop="actor">Actor 2</span>
                <span itemprop="actor">Actor 3</span>
            </div>
        `);
        global.document = document;

        const data = extractSchemaOrgMicrodata();
        expect(data).toEqual([
            {
                _type: 'http://schema.org/TVSeries',
                actor: ['Actor 1', 'Actor 2', 'Actor 3'],
            },
        ]);
    });
});
