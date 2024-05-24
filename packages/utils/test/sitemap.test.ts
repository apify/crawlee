import nock from 'nock';
import { describe, expect, it, beforeEach } from 'vitest';

import { Sitemap } from '../src/internals/sitemap';

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
                    '<lastmod>2005-01-01</lastmod>',
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
            .get('*')
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

    it('handles sitemap.txt correctly', async () => {
        const sitemap = await Sitemap.load('http://not-exists.com/sitemap.txt');
        expect(new Set(sitemap.urls)).toEqual(
            new Set([
                'http://not-exists.com/catalog?item=78&desc=vacation_crete',
                'http://not-exists.com/catalog?item=79&desc=vacation_somalia',
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
});
