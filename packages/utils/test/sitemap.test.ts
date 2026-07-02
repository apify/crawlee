import nock from 'nock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import log from '@apify/log';

import type { SitemapUrl } from '../src/internals/sitemap';
import { discoverValidSitemaps, parseSitemap, Sitemap } from '../src/internals/sitemap';

describe('Sitemap', () => {
    beforeEach(() => {
        nock.disableNetConnect();
        nock('http://not-exists.com')
            .persist()
            .get(/\/sitemap_child(_[0-9]+)?.xml/)
            .reply(
                200,
                [
                    '<?xml version="1.0" encoding="UTF-8"?>',
                    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                    '<url>',
                    '<loc>http://not-exists.com/</loc>',
                    '<lastmod>2005-02-03</lastmod>',
                    '<changefreq>monthly</changefreq>',
                    '<priority>0.8</priority>',
                    '</url>',
                    '<url>',
                    '<loc>http://not-exists.com/catalog?item=12&amp;desc=vacation_hawaii</loc>',
                    '<changefreq>weekly</changefreq>',
                    '</url>',
                    '<url>',
                    '<loc>http://not-exists.com/catalog?item=73&amp;desc=vacation_new_zealand</loc>',
                    '<lastmod>2004-12-23</lastmod>',
                    '<changefreq>weekly</changefreq>',
                    '</url>',
                    '<url>',
                    '<loc>http://not-exists.com/catalog?item=74&amp;desc=vacation_newfoundland</loc>',
                    '<lastmod>2004-12-23T18:00:15+00:00</lastmod>',
                    '<priority>0.3</priority>',
                    '</url>',
                    '<url>',
                    '<loc>http://not-exists.com/catalog?item=83&amp;desc=vacation_usa</loc>',
                    '<lastmod>2004-11-23</lastmod>',
                    '</url>',
                    '</urlset>',
                ].join('\n'),
            )
            .get('/sitemap_child.xml.gz')
            .reply(
                200,
                Buffer.from(
                    [
                        'H4sIAAAAAAAAA62S306DMBTG73kK0gtvDLSFLSKWcucTzOulKR00QottGZtPbxfQEEWXqElzkvMv',
                        '3y/fKSlPXRsehbFSqwLgGIFQKK4rqeoCPO0eowyUNCCDaa1woR9WtgCNc30O4TiOsZVOdKy3sTY1',
                        'tLzxiYVzEaL4HkzLPraa03lRaReJk7TOxlx3kMBLz08w6zpd0QShbYSwf74z1wLCG6ZqcTDihXZa',
                        'uaY9E7ioBaQ3UhvpzhTFGYEfWUDgBHANgzPHWl2XF/gCJzes6x8qYXlxZL7l/dk3bGRSvuMuxEch',
                        'nr/w/Eb2Ll2RVWLcvwrWMlWtWLWJcBIl6TdW/R/ZZp3soAdV/Yy2w1mOUI63tz4itCRd3Cz9882y',
                        'NfMGy9bJ8CfTZkU4fXUavAGtDs17GwMAAA==',
                    ].join('\n'),
                    'base64',
                ),
            )
            .get('/invalid_sitemap_child.xml.gz')
            .reply(
                200,
                Buffer.from(
                    [
                        'H4sIAAAAAAAAA62S306DMBTG73kK0gtvDLSFLSKWcucTzOulKR00QottGZtPbxfQEEWXqElzkvMv',
                        'NfMGy9bJ8CfTZkU4fXUavAGtDs17GwMAAA==',
                    ].join('\n'),
                    'base64',
                ),
            )
            .get('/non_gzipped_sitemap.xml.gz')
            .reply(
                200,
                [
                    '<?xml version="1.0" encoding="UTF-8"?>',
                    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                    '<url>',
                    '<loc>http://not-exists.com/catalog?item=80&amp;desc=vacation_turkey</loc>',
                    '<lastmod>2004-11-23</lastmod>',
                    '</url>',
                    '<url>',
                    '<loc>http://not-exists.com/catalog?item=81&amp;desc=vacation_maledives</loc>',
                    '<lastmod>2004-11-23</lastmod>',
                    '</url>',
                    '</urlset>',
                ].join('\n'),
            )
            .get('/sneakily_gzipped_sitemap.xml')
            .reply(
                200,
                Buffer.from(
                    [
                        'H4sIAAAAAAAAA62S306DMBTG73kK0gtvDLSFLSKWcucTzOulKR00QottGZtPbxfQEEWXqElzkvMv',
                        '3y/fKSlPXRsehbFSqwLgGIFQKK4rqeoCPO0eowyUNCCDaa1woR9WtgCNc30O4TiOsZVOdKy3sTY1',
                        'tLzxiYVzEaL4HkzLPraa03lRaReJk7TOxlx3kMBLz08w6zpd0QShbYSwf74z1wLCG6ZqcTDihXZa',
                        'uaY9E7ioBaQ3UhvpzhTFGYEfWUDgBHANgzPHWl2XF/gCJzes6x8qYXlxZL7l/dk3bGRSvuMuxEch',
                        'nr/w/Eb2Ll2RVWLcvwrWMlWtWLWJcBIl6TdW/R/ZZp3soAdV/Yy2w1mOUI63tz4itCRd3Cz9882y',
                        'NfMGy9bJ8CfTZkU4fXUavAGtDs17GwMAAA==',
                    ].join('\n'),
                    'base64',
                ),
            )
            .get('/sitemap_parent.xml')
            .reply(
                200,
                [
                    '<?xml version="1.0" encoding="UTF-8"?>',
                    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                    '<sitemap>',
                    '<loc>http://not-exists.com/sitemap_child.xml</loc>',
                    '<lastmod>2004-12-23</lastmod>',
                    '</sitemap>',
                    '<sitemap>',
                    '<loc>http://not-exists.com/sitemap_child_2.xml?from=94937939985&amp;to=1318570721404</loc>',
                    '<lastmod>2004-12-23</lastmod>',
                    '</sitemap>',
                    '</sitemapindex>',
                ].join('\n'),
            )
            .get('/sitemap_parent_pretty.xml')
            .reply(
                200,
                [
                    '<?xml version="1.0" encoding="UTF-8"?>',
                    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                    '<sitemap>',
                    `<loc>
                        http://not-exists.com/sitemap_child.xml
                    </loc>`,
                    `<lastmod>
                        2004-12-23
                    </lastmod>`,
                    '</sitemap>',
                    '<sitemap>',
                    `<loc>
                        http://not-exists.com/sitemap_child_2.xml?from=94937939985&amp;to=1318570721404
                    </loc>`,
                    `<lastmod>
                        2004-12-23
                    </lastmod>`,
                    '</sitemap>',
                    '</sitemapindex>',
                ].join('\n'),
            )
            .get('/not_actual_xml.xml')
            .reply(
                200,
                [
                    '<HTML><HEAD><meta http-equiv="content-type" content="text/html;charset=utf-8">',
                    '<TITLE>301 Moved</TITLE></HEAD><BODY>',
                    '<H1>301 Moved</H1>',
                    'The document has moved',
                    '<A HREF="https://ads.google.com/home/">here</A>.',
                    '</BODY></HTML>',
                ].join('\n'),
            )
            .get('/sitemap_cdata.xml')
            .reply(
                200,
                [
                    '<?xml version="1.0" encoding="UTF-8"?>',
                    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                    '<url>',
                    '<loc><![CDATA[http://not-exists.com/catalog]]></loc>',
                    '</url>',
                    '</urlset>',
                ].join('\n'),
            )
            .get('/sitemap_pretty.xml')
            .reply(
                200,
                [
                    '<?xml version="1.0" encoding="UTF-8"?>',
                    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                    '<url>',
                    `<loc>
                        http://not-exists.com/catalog?item=80&amp;desc=vacation_turkey
                    </loc>`,
                    `<lastmod>
                        2005-02-03
                    </lastmod>`,
                    `<changefreq>

                        monthly
                    </changefreq>`,
                    `<priority>
                        0.8
                    </priority>`,
                    '</url>',
                    '</urlset>',
                ].join('\n'),
            )
            .get('/sitemap.xml')
            .reply(
                200,
                [
                    '<?xml version="1.0" encoding="UTF-8"?>',
                    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                    '<url>',
                    '<loc>http://not-exists.com/catalog?item=80&amp;desc=vacation_turkey</loc>',
                    '<lastmod>2004-11-23</lastmod>',
                    '</url>',
                    '<url>',
                    '<loc>http://not-exists.com/catalog?item=81&amp;desc=vacation_maledives</loc>',
                    '<lastmod>2004-11-23</lastmod>',
                    '</url>',
                    '</urlset>',
                ].join('\n'),
            )
            .get('/sitemap.txt')
            .reply(
                200,
                [
                    'http://not-exists.com/catalog?item=78&desc=vacation_crete',
                    'http://not-exists.com/catalog?item=79&desc=vacation_somalia',
                ].join('\n'),
            )
            // urlset mixing a same-host and a cross-host URL entry (for enqueue-strategy filtering)
            .get('/cross_host_urls.xml')
            .reply(
                200,
                [
                    '<?xml version="1.0" encoding="UTF-8"?>',
                    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                    '<url><loc>http://not-exists.com/local-page</loc></url>',
                    '<url><loc>http://other.test/cross-page</loc></url>',
                    '</urlset>',
                ].join('\n'),
            )
            // sitemap index pointing at a cross-host nested sitemap
            .get('/cross_host_index.xml')
            .reply(
                200,
                [
                    '<?xml version="1.0" encoding="UTF-8"?>',
                    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                    '<sitemap><loc>http://other.test/child.xml</loc></sitemap>',
                    '</sitemapindex>',
                ].join('\n'),
            )
            // urlset mixing a valid http URL with non-http(s) schemes
            .get('/bad_schemes.xml')
            .reply(
                200,
                [
                    '<?xml version="1.0" encoding="UTF-8"?>',
                    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                    '<url><loc>http://not-exists.com/ok</loc></url>',
                    '<url><loc>mailto:foo@bar.com</loc></url>',
                    '<url><loc>javascript:alert(1)</loc></url>',
                    '<url><loc>ftp://example.com/file.txt</loc></url>',
                    '</urlset>',
                ].join('\n'),
            )
            .get('*')
            .reply(404);

        // A cross-host server whose child sitemap is served, so a *followed* nested reference would surface
        // `child-page`. Under the default `same-hostname` strategy it must never be fetched.
        nock('http://other.test')
            .persist()
            .get('/child.xml')
            .reply(
                200,
                [
                    '<?xml version="1.0" encoding="UTF-8"?>',
                    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                    '<url><loc>http://other.test/child-page</loc></url>',
                    '</urlset>',
                ].join('\n'),
            )
            .get('*')
            .reply(404);

        nock('http://not-exists-2.com')
            .persist()
            .filteringPath(() => '/')
            .get('/')
            .reply(404);
    });

    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    it('extracts urls from sitemaps', async () => {
        const sitemap = await Sitemap.load('http://not-exists.com/sitemap_child.xml');
        expect(new Set(sitemap.urls)).toEqual(
            new Set([
                'http://not-exists.com/',
                'http://not-exists.com/catalog?item=12&desc=vacation_hawaii',
                'http://not-exists.com/catalog?item=73&desc=vacation_new_zealand',
                'http://not-exists.com/catalog?item=74&desc=vacation_newfoundland',
                'http://not-exists.com/catalog?item=83&desc=vacation_usa',
            ]),
        );
    });

    it('extracts metadata from sitemaps', async () => {
        const items: SitemapUrl[] = [];

        for await (const item of parseSitemap([{ type: 'url', url: 'http://not-exists.com/sitemap_child.xml' }])) {
            items.push(item);
        }

        expect(items).toHaveLength(5);
        expect(items).toContainEqual(
            expect.objectContaining({
                loc: 'http://not-exists.com/',
                priority: 0.8,
                changefreq: 'monthly',
                lastmod: new Date('2005-02-03'),
            }),
        );
    });

    it('extracts urls from gzipped sitemaps', async () => {
        const sitemap = await Sitemap.load('http://not-exists.com/sitemap_child.xml.gz');
        expect(new Set(sitemap.urls)).toEqual(
            new Set([
                'http://not-exists.com/',
                'http://not-exists.com/catalog?item=12&desc=vacation_hawaii',
                'http://not-exists.com/catalog?item=73&desc=vacation_new_zealand',
                'http://not-exists.com/catalog?item=74&desc=vacation_newfoundland',
                'http://not-exists.com/catalog?item=83&desc=vacation_usa',
            ]),
        );
    });

    it('identifies incorrect gzipped sitemaps as malformed', async () => {
        const sitemap = await Sitemap.load('http://not-exists.com/invalid_sitemap_child.xml.gz');
        expect(new Set(sitemap.urls)).toEqual(new Set([]));
    });

    it('follows links in sitemap indexes', async () => {
        const sitemap = await Sitemap.load('http://not-exists.com/sitemap_parent.xml');
        expect(new Set(sitemap.urls)).toEqual(
            new Set([
                'http://not-exists.com/',
                'http://not-exists.com/catalog?item=12&desc=vacation_hawaii',
                'http://not-exists.com/catalog?item=73&desc=vacation_new_zealand',
                'http://not-exists.com/catalog?item=74&desc=vacation_newfoundland',
                'http://not-exists.com/catalog?item=83&desc=vacation_usa',
            ]),
        );
    });

    it('respects nestedSitemapFilter when following sitemap indexes', async () => {
        const items: SitemapUrl[] = [];

        for await (const item of parseSitemap(
            [{ type: 'url', url: 'http://not-exists.com/sitemap_parent.xml' }],
            undefined,
            {
                nestedSitemapFilter: (url) => !url.includes('sitemap_child_2'),
            },
        )) {
            items.push(item);
        }

        expect(items).toHaveLength(5);
        expect(items.every((item) => item.originSitemapUrl === 'http://not-exists.com/sitemap_child.xml')).toBe(true);
    });

    it('follows all nested sitemaps when nestedSitemapFilter is not provided', async () => {
        const items: SitemapUrl[] = [];

        for await (const item of parseSitemap([{ type: 'url', url: 'http://not-exists.com/sitemap_parent.xml' }])) {
            items.push(item);
        }

        expect(items).toHaveLength(10);
    });

    it('does not break on invalid xml', async () => {
        const sitemap = await Sitemap.load('http://not-exists.com/not_actual_xml.xml');
        expect(sitemap.urls).toEqual([]);
    });

    it('handles CDATA in loc tags', async () => {
        const sitemap = await Sitemap.load('http://not-exists.com/sitemap_cdata.xml');
        expect(new Set(sitemap.urls)).toEqual(new Set(['http://not-exists.com/catalog']));
    });

    it('autodetects sitemaps', async () => {
        const sitemap = await Sitemap.tryCommonNames('http://not-exists.com/arbitrary_url?search=xyz');
        expect(new Set(sitemap.urls)).toEqual(
            new Set([
                'http://not-exists.com/catalog?item=80&desc=vacation_turkey',
                'http://not-exists.com/catalog?item=81&desc=vacation_maledives',
                'http://not-exists.com/catalog?item=78&desc=vacation_crete',
                'http://not-exists.com/catalog?item=79&desc=vacation_somalia',
            ]),
        );
    });

    it('keeps quiet if autodetection does not find anything', async () => {
        const spy = vi.spyOn(log, 'warning');

        const sitemap = await Sitemap.tryCommonNames('http://not-exists-2.com/arbitrary_url?search=xyz');

        expect(sitemap.urls).toHaveLength(0);
        expect(spy).not.toHaveBeenCalled();
    });

    it('handles sitemap.txt correctly', async () => {
        const sitemap = await Sitemap.load('http://not-exists.com/sitemap.txt');
        expect(new Set(sitemap.urls)).toEqual(
            new Set([
                'http://not-exists.com/catalog?item=78&desc=vacation_crete',
                'http://not-exists.com/catalog?item=79&desc=vacation_somalia',
            ]),
        );
    });

    it('handles pretty-printed XML correctly', async () => {
        const sitemap = await Sitemap.load('http://not-exists.com/sitemap_pretty.xml');
        expect(new Set(sitemap.urls)).toEqual(new Set(['http://not-exists.com/catalog?item=80&desc=vacation_turkey']));
    });

    it('extracts metadata from pretty-printed XML', async () => {
        const items: SitemapUrl[] = [];

        for await (const item of parseSitemap([{ type: 'url', url: 'http://not-exists.com/sitemap_pretty.xml' }])) {
            items.push(item);
        }

        expect(items).toHaveLength(1);
        expect(items).toContainEqual(
            expect.objectContaining({
                loc: 'http://not-exists.com/catalog?item=80&desc=vacation_turkey',
                priority: 0.8,
                changefreq: 'monthly',
                lastmod: new Date('2005-02-03'),
            }),
        );
    });

    it('handles pretty-printed nested sitemaps XML correctly', async () => {
        const sitemap = await Sitemap.load('http://not-exists.com/sitemap_parent_pretty.xml');
        expect(new Set(sitemap.urls)).toEqual(
            new Set([
                'http://not-exists.com/',
                'http://not-exists.com/catalog?item=12&desc=vacation_hawaii',
                'http://not-exists.com/catalog?item=73&desc=vacation_new_zealand',
                'http://not-exists.com/catalog?item=74&desc=vacation_newfoundland',
                'http://not-exists.com/catalog?item=83&desc=vacation_usa',
            ]),
        );
    });

    it('loads sitemaps from string', async () => {
        const sitemap = await Sitemap.fromXmlString(
            [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                '<url>',
                '<loc>http://not-exists.com/catalog?item=80&amp;desc=vacation_turkey</loc>',
                '<lastmod>2004-11-23</lastmod>',
                '</url>',
                '<url>',
                '<loc>http://not-exists.com/catalog?item=81&amp;desc=vacation_maledives</loc>',
                '<lastmod>2004-11-23</lastmod>',
                '</url>',
                '</urlset>',
            ].join('\n'),
        );

        expect(new Set(sitemap.urls)).toEqual(
            new Set([
                'http://not-exists.com/catalog?item=80&desc=vacation_turkey',
                'http://not-exists.com/catalog?item=81&desc=vacation_maledives',
            ]),
        );
    });

    it('does not leak metadata from a url without loc and drops invalid lastmod', async () => {
        const items: SitemapUrl[] = [];

        for await (const item of parseSitemap([
            {
                type: 'raw',
                content: [
                    '<?xml version="1.0" encoding="UTF-8"?>',
                    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                    '<url>',
                    '<loc>http://not-exists.com/a</loc>',
                    '<lastmod>not-a-date</lastmod>',
                    '</url>',
                    '<url>',
                    '<lastmod>2020-01-01</lastmod>',
                    '<priority>0.5</priority>',
                    '</url>',
                    '<url>',
                    '<loc>http://not-exists.com/c</loc>',
                    '</url>',
                    '</urlset>',
                ].join('\n'),
            },
        ])) {
            items.push(item);
        }

        expect(items.map((item) => item.loc)).toEqual(['http://not-exists.com/a', 'http://not-exists.com/c']);
        expect(items[0].lastmod).toBeUndefined();
        expect(items[1].lastmod).toBeUndefined();
        expect(items[1].priority).toBeUndefined();
    });

    it('loads sitemaps that reference other sitemaps from string', async () => {
        const sitemap = await Sitemap.fromXmlString(
            [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                '<sitemap>',
                '<loc>http://not-exists.com/sitemap_child.xml</loc>',
                '<lastmod>2004-12-23</lastmod>',
                '</sitemap>',
                '<sitemap>',
                '<loc>http://not-exists.com/sitemap_child_2.xml?from=94937939985&amp;to=1318570721404</loc>',
                '<lastmod>2004-12-23</lastmod>',
                '</sitemap>',
                '</sitemapindex>',
            ].join('\n'),
        );

        expect(new Set(sitemap.urls)).toEqual(
            new Set([
                'http://not-exists.com/',
                'http://not-exists.com/catalog?item=12&desc=vacation_hawaii',
                'http://not-exists.com/catalog?item=73&desc=vacation_new_zealand',
                'http://not-exists.com/catalog?item=74&desc=vacation_newfoundland',
                'http://not-exists.com/catalog?item=83&desc=vacation_usa',
            ]),
        );
    });

    it("loads XML sitemap even though it's gzipped according to file extension", async () => {
        const sitemap = await Sitemap.load('http://not-exists.com/non_gzipped_sitemap.xml.gz');

        expect(new Set(sitemap.urls)).toEqual(
            new Set([
                'http://not-exists.com/catalog?item=80&desc=vacation_turkey',
                'http://not-exists.com/catalog?item=81&desc=vacation_maledives',
            ]),
        );
    });

    it("loads gzipped sitemap even though it's not gzipped according to file extension", async () => {
        const sitemap = await Sitemap.load('http://not-exists.com/sneakily_gzipped_sitemap.xml');

        expect(new Set(sitemap.urls)).toEqual(
            new Set([
                'http://not-exists.com/',
                'http://not-exists.com/catalog?item=12&desc=vacation_hawaii',
                'http://not-exists.com/catalog?item=73&desc=vacation_new_zealand',
                'http://not-exists.com/catalog?item=74&desc=vacation_newfoundland',
                'http://not-exists.com/catalog?item=83&desc=vacation_usa',
            ]),
        );
    });

    it('drops cross-host URL entries under the default same-hostname strategy', async () => {
        const sitemap = await Sitemap.load('http://not-exists.com/cross_host_urls.xml');
        expect(sitemap.urls).toEqual(['http://not-exists.com/local-page']);
    });

    it('keeps cross-host URL entries when enqueueStrategy is "all"', async () => {
        const sitemap = await Sitemap.load('http://not-exists.com/cross_host_urls.xml', undefined, {
            enqueueStrategy: 'all',
        });
        expect(new Set(sitemap.urls)).toEqual(
            new Set(['http://not-exists.com/local-page', 'http://other.test/cross-page']),
        );
    });

    it('does not fetch cross-host nested sitemaps under the default same-hostname strategy', async () => {
        const sitemap = await Sitemap.load('http://not-exists.com/cross_host_index.xml');
        // If the cross-host nested sitemap were fetched, `child-page` would appear in the result.
        expect(sitemap.urls).toEqual([]);
    });

    it('follows cross-host nested sitemaps when enqueueStrategy is "all"', async () => {
        const sitemap = await Sitemap.load('http://not-exists.com/cross_host_index.xml', undefined, {
            enqueueStrategy: 'all',
        });
        expect(sitemap.urls).toEqual(['http://other.test/child-page']);
    });

    it('drops non-http(s) scheme entries even when enqueueStrategy is "all"', async () => {
        const sitemap = await Sitemap.load('http://not-exists.com/bad_schemes.xml', undefined, {
            enqueueStrategy: 'all',
        });
        expect(sitemap.urls).toEqual(['http://not-exists.com/ok']);
    });
});

describe('discoverValidSitemaps', () => {
    beforeEach(() => {
        nock.disableNetConnect();
    });

    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    it('extracts sitemap from robots.txt', async () => {
        nock('http://sitemap-discovery.com')
            .get('/robots.txt')
            .reply(200, 'Sitemap: http://sitemap-discovery.com/some-sitemap.xml')
            .head('/some-sitemap.xml')
            .reply(200, '')
            .head('/sitemap.xml')
            .reply(404, '')
            .head('/sitemap.txt')
            .reply(404, '')
            .head('/sitemap_index.xml')
            .reply(404, '');

        const urls = [];
        for await (const url of discoverValidSitemaps(['http://sitemap-discovery.com'])) {
            urls.push(url);
        }

        expect(urls).toEqual(['http://sitemap-discovery.com/some-sitemap.xml']);
    });

    it('discovers cross-host sitemaps referenced in robots.txt', async () => {
        nock('http://sitemap-discovery.com')
            .get('/robots.txt')
            .reply(200, 'Sitemap: http://cdn.other-host.com/some-sitemap.xml')
            .head('/sitemap.xml')
            .reply(404, '')
            .head('/sitemap.txt')
            .reply(404, '')
            .head('/sitemap_index.xml')
            .reply(404, '');

        const urls = [];
        for await (const url of discoverValidSitemaps(['http://sitemap-discovery.com'])) {
            urls.push(url);
        }

        // Cross-host sitemap is surfaced; host scoping is applied at load time.
        expect(urls).toEqual(['http://cdn.other-host.com/some-sitemap.xml']);
    });

    it('extracts sitemap from well-known paths if robots.txt is missing', async () => {
        nock('http://sitemap-discovery.com')
            .get('/robots.txt')
            .reply(404)
            .head('/sitemap.xml')
            .reply(200, '')
            .head('/sitemap.txt')
            .reply(404, '')
            .head('/sitemap_index.xml')
            .reply(404, '');

        const urls = [];
        for await (const url of discoverValidSitemaps(['http://sitemap-discovery.com'])) {
            urls.push(url);
        }

        expect(urls).toEqual(['http://sitemap-discovery.com/sitemap.xml']);
    });

    it('extracts sitemap from well-known paths if robots.txt is missing (txt)', async () => {
        nock('http://sitemap-discovery.com')
            .get('/robots.txt')
            .reply(404)
            .head('/sitemap.xml')
            .reply(404, '')
            .head('/sitemap.txt')
            .reply(200, '')
            .head('/sitemap_index.xml')
            .reply(404, '');

        const urls = [];
        for await (const url of discoverValidSitemaps(['http://sitemap-discovery.com'])) {
            urls.push(url);
        }

        expect(urls).toEqual(['http://sitemap-discovery.com/sitemap.txt']);
    });

    it('extracts sitemap from well-known paths if robots.txt is missing (sitemap_index.xml)', async () => {
        nock('http://sitemap-discovery.com')
            .get('/robots.txt')
            .reply(404)
            .head('/sitemap.xml')
            .reply(404, '')
            .head('/sitemap.txt')
            .reply(404, '')
            .head('/sitemap_index.xml')
            .reply(200, '');

        const urls = [];
        for await (const url of discoverValidSitemaps(['http://sitemap-discovery.com'])) {
            urls.push(url);
        }

        expect(urls).toEqual(['http://sitemap-discovery.com/sitemap_index.xml']);
    });

    it('extracts sitemap from input url', async () => {
        nock('http://sitemap-discovery.com').get('/robots.txt').reply(404);

        const urls = [];
        for await (const url of discoverValidSitemaps(['http://sitemap-discovery.com/sitemap.xml'])) {
            urls.push(url);
        }

        expect(urls).toEqual(['http://sitemap-discovery.com/sitemap.xml']);
    });

    it('extracts sitemaps from multiple domains with mixed order', async () => {
        nock('http://domain-a.com')
            .get('/robots.txt')
            .delay(10)
            .reply(404)
            .head('/sitemap.xml')
            .delay(30)
            .reply(200, '')
            .head('/sitemap.txt')
            .delay(50)
            .reply(200, '')
            .head('/sitemap_index.xml')
            .reply(404);

        nock('http://domain-b.com')
            .get('/robots.txt')
            .delay(20)
            .reply(404)
            .head('/sitemap.xml')
            .delay(40)
            .reply(200, '')
            .head('/sitemap.txt')
            .delay(60)
            .reply(200, '')
            .head('/sitemap_index.xml')
            .reply(404);

        const urls = [];
        for await (const url of discoverValidSitemaps(['http://domain-a.com', 'http://domain-b.com'])) {
            urls.push(url);
        }

        expect(urls.slice().sort()).toEqual(
            [
                'http://domain-a.com/sitemap.xml',
                'http://domain-b.com/sitemap.xml',
                'http://domain-a.com/sitemap.txt',
                'http://domain-b.com/sitemap.txt',
            ].sort(),
        );
    });

    it('aborts when timeoutMillis elapses', async () => {
        nock('http://slow-site.com')
            .get('/robots.txt')
            .delay(5_000)
            .reply(200, 'Sitemap: http://slow-site.com/sitemap.xml');

        const start = Date.now();
        const urls = [];
        for await (const url of discoverValidSitemaps(['http://slow-site.com'], { timeoutMillis: 100 })) {
            urls.push(url);
        }
        const elapsed = Date.now() - start;

        expect(urls).toEqual([]);
        expect(elapsed).toBeLessThan(2_000);
    });

    it('aborts when external signal is triggered', async () => {
        nock('http://slow-site.com')
            .get('/robots.txt')
            .delay(5_000)
            .reply(200, 'Sitemap: http://slow-site.com/sitemap.xml');

        const ac = new AbortController();
        setTimeout(() => ac.abort(), 100);

        const start = Date.now();
        const urls = [];
        for await (const url of discoverValidSitemaps(['http://slow-site.com'], {
            timeoutMillis: 60_000,
            signal: ac.signal,
        })) {
            urls.push(url);
        }
        const elapsed = Date.now() - start;

        expect(urls).toEqual([]);
        expect(elapsed).toBeLessThan(2_000);
    });

    it('aborts immediately when signal is already aborted', async () => {
        nock('http://slow-site.com')
            .get('/robots.txt')
            .delay(5_000)
            .reply(200, 'Sitemap: http://slow-site.com/sitemap.xml');

        const ac = new AbortController();
        ac.abort();

        const start = Date.now();
        const urls = [];
        for await (const url of discoverValidSitemaps(['http://slow-site.com'], { signal: ac.signal })) {
            urls.push(url);
        }
        const elapsed = Date.now() - start;

        expect(urls).toEqual([]);
        expect(elapsed).toBeLessThan(1_000);
    });

    it('requestTimeoutMillis aborts slow robots.txt without killing the whole discovery', async () => {
        nock('http://slow-site.com')
            .get('/robots.txt')
            .delay(5_000)
            .reply(200, 'Sitemap: http://slow-site.com/sitemap.xml')
            .head('/sitemap.xml')
            .reply(200, '')
            .head('/sitemap.txt')
            .reply(404, '')
            .head('/sitemap_index.xml')
            .reply(404, '');

        const start = Date.now();
        const urls = [];
        for await (const url of discoverValidSitemaps(['http://slow-site.com'], {
            timeoutMillis: 30_000,
            requestTimeoutMillis: 100,
        })) {
            urls.push(url);
        }
        const elapsed = Date.now() - start;

        expect(urls).toEqual(['http://slow-site.com/sitemap.xml']);
        expect(elapsed).toBeLessThan(2_000);
    });
});
