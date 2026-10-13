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

    test('lets the abort signal decide when a request times out, not the 30 s impit default', async () => {
        const httpClient = new ImpitHttpClient();
        const { signal } = new AbortController();

        await httpClient.sendRequest(new Request('http://example.com'), { signal });

        const { fetch } = vi.mocked(Impit).mock.instances[0];
        const [, init] = vi.mocked(fetch).mock.calls[0];
        expect(init).toMatchObject({ signal });
        expect(init?.timeout).toBeGreaterThan(24 * 60 * 60 * 1000);
    });

    test('keeps the impit default timeout when there is no abort signal', async () => {
        const httpClient = new ImpitHttpClient();

        await httpClient.sendRequest(new Request('http://example.com'));

        const { fetch } = vi.mocked(Impit).mock.instances[0];
        const [, init] = vi.mocked(fetch).mock.calls[0];
        expect(init?.timeout).toBeUndefined();
    });
});
