import nock from 'nock';
import { describe, expect, it, beforeEach } from 'vitest';

import { RobotsFile } from '../src/internals/robots';

describe('RobotsFile', () => {
    beforeEach(() => {
        nock.disableNetConnect();
        nock('http://not-exists.com')
            .persist()
            .get('/robots.txt')
            .reply(
                200,
                [
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
                ].join('\n'),
            )
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
        expect(robots.getSitemaps()).toEqual([
            'http://not-exists.com/sitemap_1.xml',
            'http://not-exists.com/sitemap_2.xml',
        ]);
    });

    it('parses allow/deny directives from explicitly provided robots.txt contents', async () => {
        const contents = `User-agent: *',
Disallow: *deny_all/
crawl-delay: 10
User-agent: Googlebot
Disallow: *deny_googlebot/`;
        const robots = RobotsFile.from('http://not-exists.com/robots.txt', contents);
        expect(robots.isAllowed('http://not-exists.com/something/page.html')).toBe(true);
        expect(robots.isAllowed('http://not-exists.com/deny_googlebot/page.html')).toBe(true);
        expect(robots.isAllowed('http://not-exists.com/deny_googlebot/page.html', 'Googlebot')).toBe(false);
        expect(robots.isAllowed('http://not-exists.com/deny_all/page.html')).toBe(true);
    });
});
