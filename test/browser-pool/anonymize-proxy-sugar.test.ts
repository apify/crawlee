import { vi } from 'vitest';
import { anonymizeProxy } from 'proxy-chain';

import { anonymizeProxySugar } from '../../packages/browser-pool/src/anonymize-proxy';

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

    test('should handle proxy url without a trailing slash correctly', async () => {
        const proxyUrl = 'http://username:password@proxy:1000';
        const [anonymized] = await anonymizeProxySugar(proxyUrl);

        expect(anonymizeProxy).toHaveBeenCalledWith('http://username:password@proxy:1000');
        expect(anonymized).toBeTypeOf('string');
    });

    test('should trim off trailing slash from proxy url', async () => {
        const proxyUrl = 'http://username:password@proxy:1000/';
        const [anonymized] = await anonymizeProxySugar(proxyUrl);

        expect(anonymizeProxy).toHaveBeenCalledWith('http://username:password@proxy:1000');
        expect(anonymized).toBeTypeOf('string');
    });
});
