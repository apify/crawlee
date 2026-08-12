import { ImpitHttpClient } from '@crawlee/impit-client';
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

    test('reuses cached clients by default', () => {
        const httpClient = new ImpitHttpClient();

        (httpClient as any).getClient({ proxyUrl: 'http://proxy.example' });
        (httpClient as any).getClient({ proxyUrl: 'http://proxy.example' });

        expect(Impit).toHaveBeenCalledTimes(1);
    });

    test('creates a new client for each request when cacheClients is false', () => {
        const httpClient = new ImpitHttpClient({ cacheClients: false });

        (httpClient as any).getClient({ proxyUrl: 'http://proxy.example' });
        (httpClient as any).getClient({ proxyUrl: 'http://proxy.example' });

        expect(Impit).toHaveBeenCalledTimes(2);
    });

    test('forwards the per-request ignoreTlsErrors flag to the impit client', async () => {
        const httpClient = new ImpitHttpClient();

        await httpClient.fetch(new Request('http://example.com'), { ignoreTlsErrors: true });

        expect(Impit).toHaveBeenCalledWith(expect.objectContaining({ ignoreTlsErrors: true }));
    });

    test('keeps constructor-level ignoreTlsErrors when the per-request flag is absent', async () => {
        const httpClient = new ImpitHttpClient({ ignoreTlsErrors: true });

        await httpClient.fetch(new Request('http://example.com'), {});

        expect(Impit).toHaveBeenCalledWith(expect.objectContaining({ ignoreTlsErrors: true }));
    });
});
