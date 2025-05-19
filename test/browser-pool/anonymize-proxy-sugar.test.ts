import { anonymizeProxy } from 'proxy-chain';
import { vi } from 'vitest';

import { anonymizeProxySugar } from '../../packages/browser-pool/src/anonymize-proxy.js';

describe('anonymizeProxySugar', () => {
    // Mock the anonymizeProxy function from proxy-chain
    beforeEach(() => {
        vi.mock('proxy-chain', () => ({
            anonymizeProxy: vi.fn((url) => Promise.resolve(`anonymized-${url}`)),
        }));
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    test.each([
        ['http://username:password@proxy:1000', 'http://username:password@proxy:1000'],
        ['http://username:password@proxy:1000/', 'http://username:password@proxy:1000'],
        ['socks://username:password@proxy:1000', 'socks://username:password@proxy:1000'],
        ['socks://username:password@proxy:1000/', 'socks://username:password@proxy:1000'],
    ])(
        'should call anonymizeProxy from proxy-chain with correctly pre-processed URL: %s',
        async (input, expectedOutput) => {
            const [anonymized] = await anonymizeProxySugar(input);

            expect(anonymizeProxy).toHaveBeenCalledWith(expectedOutput);
            expect(anonymized).toBeTypeOf('string');
        },
    );
});
