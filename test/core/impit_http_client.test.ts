import { ImpitHttpClient } from '@crawlee/impit-client';
import { Impit } from 'impit';

vi.mock('impit', () => ({
    Impit: vi.fn(
        class {
            fetch = vi.fn();
        },
    ),
}));

function createRedirectResponse(status: number, location: string, setCookie: string[] = []) {
    const headers = new Headers({ location });
    for (const cookie of setCookie) headers.append('set-cookie', cookie);

    return {
        status,
        statusText: 'Found',
        url: 'http://example.com/start',
        headers,
        body: undefined,
    };
}

function createFinalResponse(body = 'ok') {
    return {
        status: 200,
        statusText: 'OK',
        url: 'http://example.com/final',
        headers: new Headers({ 'content-type': 'text/plain', 'content-length': String(body.length) }),
        body: new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(body));
                controller.close();
            },
        }),
        text: async () => body,
        json: async () => ({ body }),
        bytes: async () => Buffer.from(body),
    };
}

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

    test('stream() invokes onRedirect and forwards mutated Cookie header to the next hop', async () => {
        const httpClient = new ImpitHttpClient({ cacheClients: false });
        const fetchMock = vi.fn();

        vi.mocked(Impit).mockImplementation(
            class {
                fetch = fetchMock;
            } as any,
        );

        fetchMock
            .mockResolvedValueOnce(createRedirectResponse(302, '/final', ['session=abc', 'other=def']))
            .mockResolvedValueOnce(createFinalResponse('done'));

        const onRedirect = vi.fn((_redirectResponse, updatedRequest) => {
            updatedRequest.headers.Cookie = 'session=abc';
        });

        const response = await httpClient.stream(
            {
                url: 'http://example.com/start',
                method: 'GET',
                headers: {},
            },
            onRedirect,
        );

        expect(onRedirect).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledTimes(2);

        const [redirectResponse] = onRedirect.mock.calls[0];
        expect(redirectResponse.statusCode).toBe(302);
        expect(redirectResponse.headers['set-cookie']).toEqual(['session=abc', 'other=def']);

        const secondCallHeaders = fetchMock.mock.calls[1][1].headers as Headers;
        expect(secondCallHeaders.get('Cookie')).toBe('session=abc');
        expect(fetchMock.mock.calls[1][0]).toBe('http://example.com/final');
        expect(response.statusCode).toBe(200);
        expect(response.redirectUrls).toEqual([new URL('http://example.com/final')]);
    });

    test('stream() follows redirects without onRedirect for API compatibility', async () => {
        const httpClient = new ImpitHttpClient({ cacheClients: false });
        const fetchMock = vi.fn();

        vi.mocked(Impit).mockImplementation(
            class {
                fetch = fetchMock;
            } as any,
        );

        fetchMock
            .mockResolvedValueOnce(createRedirectResponse(302, 'http://example.com/final'))
            .mockResolvedValueOnce(createFinalResponse('done'));

        const response = await httpClient.stream({
            url: 'http://example.com/start',
            method: 'GET',
            headers: {},
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(response.statusCode).toBe(200);
        expect(response.redirectUrls).toHaveLength(1);
    });
});
