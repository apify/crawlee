import { describe, expect, it } from 'vitest';

import { filterUrl, matchesEnqueueStrategy } from '../src/internals/url';

describe('matchesEnqueueStrategy', () => {
    const match = (strategy: Parameters<typeof matchesEnqueueStrategy>[0], target: string, origin: string) =>
        matchesEnqueueStrategy(strategy, new URL(target), new URL(origin));

    it('all matches regardless of host, domain, or scheme', () => {
        expect(match('all', 'https://other.test/page', 'http://example.com/sitemap.xml')).toBe(true);
    });

    it('same-hostname matches only the exact host', () => {
        expect(match('same-hostname', 'http://example.com/a', 'http://example.com/sitemap.xml')).toBe(true);
        expect(match('same-hostname', 'http://www.example.com/a', 'http://example.com/sitemap.xml')).toBe(false);
    });

    it('same-domain matches across subdomains but not across registrable domains', () => {
        expect(match('same-domain', 'http://www.example.com/a', 'http://example.com/sitemap.xml')).toBe(true);
        expect(match('same-domain', 'http://example.org/a', 'http://example.com/sitemap.xml')).toBe(false);
    });

    it('same-origin requires matching scheme, host, and port', () => {
        expect(match('same-origin', 'http://example.com/a', 'http://example.com/sitemap.xml')).toBe(true);
        expect(match('same-origin', 'https://example.com/a', 'http://example.com/sitemap.xml')).toBe(false);
    });

    it('treats a trailing-dot FQDN host as equal to the bare host across strategies', () => {
        for (const strategy of ['same-hostname', 'same-domain', 'same-origin'] as const) {
            expect(match(strategy, 'http://example.com./page', 'http://example.com/sitemap.xml')).toBe(true);
        }
    });
});

describe('filterUrl', () => {
    it('drops non-http(s) schemes regardless of strategy', () => {
        for (const target of ['mailto:foo@bar.com', 'ftp://example.com/f.txt']) {
            expect(filterUrl(target, 'http://example.com/sitemap.xml', 'all').allowed).toBe(false);
        }
    });

    it('drops gracefully (no throw) when the origin is not parseable', () => {
        expect(() => filterUrl('http://example.com/a', 'not-a-url', 'same-hostname')).not.toThrow();
        expect(filterUrl('http://example.com/a', 'not-a-url', 'same-hostname')).toEqual({
            allowed: false,
            reason: 'invalid origin URL',
        });
    });
});
