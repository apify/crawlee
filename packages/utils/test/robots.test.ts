import nock from 'nock';
import { describe, expect, it, beforeEach } from 'vitest';

import { RobotsFile, Sitemap } from '../src/internals/robots';

describe('RobotsFile', () => {
    beforeEach(() => {
        nock.disableNetConnect();
        nock('http://not-exists.com').persist()
            .get('/robots.txt')
            .reply(200, [
                'User-agent: *',
                'Disallow: *deny_all/',
                'crawl-delay: 10',

                'User-agent: Googlebot',
                'Disallow: *deny_googlebot/',
                'crawl-delay: 1',

                'user-agent: Mozilla',
                'crawl-delay: 2',

                'sitemap: http://not-exists.com/sitemap_1.xml',
                'sitemap: http://not-exists.com/sitemap_2.xml',
            ].join('\n'))
            .get('*')
            .reply(404);
    });

    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    it('generates the correct robots.txt URL', async () => {
        const robots = await RobotsFile.find('http://not-exists.com/nested/index.html');
        expect(robots.getSitemaps()).not.toHaveLength(0);
    });

    it('parses allow/deny directives from robots.txt', async () => {
        const robots = await RobotsFile.find('http://not-exists.com/robots.txt');
        expect(robots.isAllowed('http://not-exists.com/something/page.html')).toBe(true);
        expect(robots.isAllowed('http://not-exists.com/deny_googlebot/page.html')).toBe(true);
        expect(robots.isAllowed('http://not-exists.com/deny_all/page.html')).toBe(false);
    });

    it('extracts sitemap urls', async () => {
        const robots = await RobotsFile.find('http://not-exists.com/robots.txt');
        expect(robots.getSitemaps()).toEqual(['http://not-exists.com/sitemap_1.xml', 'http://not-exists.com/sitemap_2.xml']);
    });
});

describe('Sitemap', () => {
    beforeEach(() => {
        nock.disableNetConnect();
        nock('http://not-exists.com').persist()
            .get('/sitemap_child.xml')
            .reply(200, [
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
            ].join('\n'))
            .get('/sitemap_parent.xml')
            .reply(200, [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                '<sitemap>',
                '<loc>http://not-exists.com/sitemap_child.xml</loc>',
                '<lastmod>2004-12-23</lastmod>',
                '</sitemap>',
                '</sitemapindex>',
            ].join('\n'))
            .get('*')
            .reply(404);
    });

    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    it('extracts urls from sitemaps', async () => {
        const sitemap = await Sitemap.load('http://not-exists.com/sitemap_child.xml');
        expect(new Set(sitemap.urls)).toEqual(new Set([
            'http://not-exists.com/',
            'http://not-exists.com/catalog?item=12&desc=vacation_hawaii',
            'http://not-exists.com/catalog?item=73&desc=vacation_new_zealand',
            'http://not-exists.com/catalog?item=74&desc=vacation_newfoundland',
            'http://not-exists.com/catalog?item=83&desc=vacation_usa',
        ]));
    });

    it('follows links in sitemap indexes', async () => {
        const sitemap = await Sitemap.load('http://not-exists.com/sitemap_parent.xml');
        expect(new Set(sitemap.urls)).toEqual(new Set([
            'http://not-exists.com/',
            'http://not-exists.com/catalog?item=12&desc=vacation_hawaii',
            'http://not-exists.com/catalog?item=73&desc=vacation_new_zealand',
            'http://not-exists.com/catalog?item=74&desc=vacation_newfoundland',
            'http://not-exists.com/catalog?item=83&desc=vacation_usa',
        ]));
    });
});
