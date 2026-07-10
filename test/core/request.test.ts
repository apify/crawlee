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
});
