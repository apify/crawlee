import { GotScrapingHttpClient } from '@crawlee/got-scraping-client';
import { gotScraping } from 'got-scraping';

vi.mock('got-scraping', () => ({
    gotScraping: vi.fn(async () => ({
        rawBody: Buffer.from('ok'),
        headers: { 'content-type': 'text/plain' },
        statusCode: 200,
        statusMessage: 'OK',
        url: 'http://example.com/',
    })),
}));

describe('GotScrapingHttpClient', () => {
    beforeEach(() => {
        vi.mocked(gotScraping).mockClear();
    });

    test('disables certificate verification when ignoreTlsErrors is set', async () => {
        const httpClient = new GotScrapingHttpClient();

        await httpClient.sendRequest(new Request('http://example.com'), { ignoreTlsErrors: true });

        expect(gotScraping).toHaveBeenCalledWith(expect.objectContaining({ https: { rejectUnauthorized: false } }));
    });

    test('leaves certificate verification enabled without the flag', async () => {
        const httpClient = new GotScrapingHttpClient();

        await httpClient.sendRequest(new Request('http://example.com'));

        expect(gotScraping).toHaveBeenCalledWith(expect.not.objectContaining({ https: expect.anything() }));
    });

    test('lets the abort signal decide when a request times out, not the 60 s got-scraping default', async () => {
        const httpClient = new GotScrapingHttpClient();
        const { signal } = new AbortController();

        await httpClient.sendRequest(new Request('http://example.com'), { signal });

        expect(gotScraping).toHaveBeenCalledWith(
            expect.objectContaining({ signal, timeout: expect.objectContaining({ request: undefined }) }),
        );
    });

    test('keeps the got-scraping default timeout when there is no abort signal', async () => {
        const httpClient = new GotScrapingHttpClient();

        await httpClient.sendRequest(new Request('http://example.com'));

        expect(gotScraping).toHaveBeenCalledWith(expect.not.objectContaining({ timeout: expect.anything() }));
    });
});
