import { serviceLocator } from '@crawlee/core';
import { ImpitHttpClient } from '@crawlee/impit-client';
import type { CrawleeLogger, ISession } from '@crawlee/types';
import { Impit } from 'impit';

vi.mock('impit', () => ({
    Impit: vi.fn(
        class {
            fetch = vi.fn(async () => new Response('ok'));
        },
    ),
}));

describe('ImpitHttpClient', () => {
    beforeEach(() => {
        vi.mocked(Impit).mockClear();
    });

    test('reuses cached clients by default', async () => {
        const httpClient = new ImpitHttpClient();

        await httpClient.sendRequest(new Request('http://example.com'));
        await httpClient.sendRequest(new Request('http://example.com'));

        expect(Impit).toHaveBeenCalledTimes(1);
    });

    test('creates a new client for each request when cacheClients is false', async () => {
        const httpClient = new ImpitHttpClient({ cacheClients: false });

        await httpClient.sendRequest(new Request('http://example.com'));
        await httpClient.sendRequest(new Request('http://example.com'));

        expect(Impit).toHaveBeenCalledTimes(2);
    });

    test('forwards the per-request ignoreTlsErrors flag to the impit client', async () => {
        const httpClient = new ImpitHttpClient();

        await httpClient.sendRequest(new Request('http://example.com'), { ignoreTlsErrors: true });

        expect(Impit).toHaveBeenCalledWith(expect.objectContaining({ ignoreTlsErrors: true }));
    });

    test('keeps constructor-level ignoreTlsErrors when the per-request flag is absent', async () => {
        const httpClient = new ImpitHttpClient({ ignoreTlsErrors: true });

        await httpClient.sendRequest(new Request('http://example.com'));

        expect(Impit).toHaveBeenCalledWith(expect.objectContaining({ ignoreTlsErrors: true }));
    });

    test('constructor-level browser takes precedence over the session fingerprint', async () => {
        const httpClient = new ImpitHttpClient({ browser: 'firefox144' });
        const session = { fingerprint: { browser: 'chrome' } } as ISession;

        await httpClient.sendRequest(new Request('http://example.com'), { session });

        expect(Impit).toHaveBeenCalledTimes(1);
        expect(Impit).toHaveBeenCalledWith(expect.objectContaining({ browser: 'firefox144' }));
    });

    test('warns on the passed logger only when the browser option is set', () => {
        const logger = { warningOnce: vi.fn() } as unknown as CrawleeLogger;

        void new ImpitHttpClient({ logger });
        expect(logger.warningOnce).not.toHaveBeenCalled();

        void new ImpitHttpClient({ browser: 'firefox144', logger });
        expect(logger.warningOnce).toHaveBeenCalledWith(expect.stringContaining('incompatible Session setups'));
    });

    test('warns on the service locator logger when no logger is passed', () => {
        const warningOnce = vi.spyOn(serviceLocator.getLogger(), 'warningOnce').mockImplementation(() => {});

        void new ImpitHttpClient({ browser: 'firefox144' });
        expect(warningOnce).toHaveBeenCalledWith(expect.stringContaining('incompatible Session setups'));
    });

    test('uses the session fingerprint when no browser is set on the client', async () => {
        const httpClient = new ImpitHttpClient();
        const session = { fingerprint: { browser: 'firefox' } } as ISession;

        await httpClient.sendRequest(new Request('http://example.com'), { session });

        expect(Impit).toHaveBeenCalledWith(expect.objectContaining({ browser: expect.stringMatching(/^firefox/) }));
    });
});
