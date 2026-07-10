import { Request } from '@crawlee/core';

describe('Request', () => {
    test('computeUniqueKey uses pipe-separated method|payloadHash|url format', () => {
        const uniqueKey = Request.computeUniqueKey({
            url: 'https://example.com',
            method: 'POST',
            payload: 'abc',
            useExtendedUniqueKey: true,
        });

        expect(uniqueKey).toMatch(/^POST\|[^|]+\|https:\/\/example\.com$/);
    });

    test('alwaysEnqueue prepends a random value to the unique key', () => {
        const request1 = new Request({ url: 'https://example.com', alwaysEnqueue: true });
        const request2 = new Request({ url: 'https://example.com', alwaysEnqueue: true });

        expect(request1.uniqueKey).not.toBe(request2.uniqueKey);
        expect(request1.uniqueKey).toMatch(/^[^|]+\|https:\/\/example\.com$/);
    });

    test('alwaysEnqueue throws when combined with a custom uniqueKey', () => {
        expect(() => new Request({ url: 'https://example.com', uniqueKey: 'custom', alwaysEnqueue: true })).toThrow();
    });
});
