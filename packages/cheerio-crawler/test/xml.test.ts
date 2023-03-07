import type { Server } from 'node:http';
import type { CheerioCrawlingContext } from '@crawlee/cheerio';
import { CheerioCrawler } from '@crawlee/cheerio';
import { runExampleComServer } from '../../../test/shared/_helper';

let serverAddress = 'http://localhost:';
let port: number;
let server: Server;

beforeAll(async () => {
    [server, port] = await runExampleComServer();
    serverAddress += port;
});

afterAll(() => {
    server.close();
});

describe('CheerioCrawler - XML should be parsed correctly', () => {
    test('should parse XML', async () => {
        let value!: string;

        function handler({ $ }: CheerioCrawlingContext) {
            value = $('item').first().find('link').text();
        }

        const crawler = new CheerioCrawler({
            requestHandler: handler,
        });

        await crawler.run([`${serverAddress}/special/complex-xml`]);

        expect(value).toBeTruthy();
    });
});
