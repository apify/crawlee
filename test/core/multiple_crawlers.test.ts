import { MemoryStorage } from '@crawlee/memory-storage';
import { CheerioCrawler, Configuration } from 'crawlee';

describe('multiple crawlers', () => {
    test('Crawler instances with different StorageClients do not affect each other', async () => {
        const getCrawler = () => {
            return new CheerioCrawler({
                requestHandler: async () => {},
            }, new Configuration({
                storageClient: new MemoryStorage({
                    persistStorage: false,
                }),
            }));
        };

        const a = getCrawler();

        await a.run([
            { url: 'https://example.org/' },
        ]);

        const b = getCrawler();

        await b.run([
            { url: 'https://example.org/' },
        ]);

        expect(a.stats.state.requestsFinished).toBe(1);
        expect(b.stats.state.requestsFinished).toBe(1);
    });
});
