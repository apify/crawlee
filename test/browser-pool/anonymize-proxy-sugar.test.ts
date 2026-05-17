import { anonymizeProxy } from 'proxy-chain';
import { vi } from 'vitest';

import { anonymizeProxySugar } from '../../packages/browser-pool/src/anonymize-proxy';

describe('anonymizeProxySugar', () => {
    // Mock the anonymizeProxy function from proxy-chain
    beforeEach(() => {
        vi.mock('proxy-chain', () => ({
            anonymizeProxy: vi.fn((opts) => Promise.resolve(`anonymized-${opts.url}`)),
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
    ])('should call anonymizeProxy from proxy-chain with correctly pre-processed URL: %s', async (input, expectedOutput) => {
        const [anonymized] = await anonymizeProxySugar(input);

        expect(anonymizeProxy).toHaveBeenCalledWith(expect.objectContaining({ url: expectedOutput }));
        expect(anonymized).toBeTypeOf('string');
    });

    test('should pass ignoreProxyCertificate to anonymizeProxy', async () => {
        await anonymizeProxySugar('http://username:password@proxy:1000', undefined, undefined, {
            ignoreProxyCertificate: true,
        });

        expect(anonymizeProxy).toHaveBeenCalledWith(expect.objectContaining({ ignoreProxyCertificate: true }));
    });

    test('should anonymize proxy without credentials when ignoreProxyCertificate is set', async () => {
        const [anonymized] = await anonymizeProxySugar('http://proxy:1000', undefined, undefined, {
            ignoreProxyCertificate: true,
        });

        expect(anonymizeProxy).toHaveBeenCalledWith(
            expect.objectContaining({ url: 'http://proxy:1000', ignoreProxyCertificate: true }),
        );
        expect(anonymized).toBeTypeOf('string');
    });

    test('should not anonymize proxy without credentials and without ignoreProxyCertificate', async () => {
        const [anonymized] = await anonymizeProxySugar('http://proxy:1000');

        expect(anonymizeProxy).not.toHaveBeenCalled();
        expect(anonymized).toBeUndefined();
    });
});
