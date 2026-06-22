import { ImpitHttpClient } from '@crawlee/impit-client';
import { Impit } from 'impit';

vi.mock('impit', () => ({
    Impit: vi.fn(
        class {
            fetch = vi.fn();
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
});
