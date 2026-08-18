import { CheerioCrawler } from '@crawlee/cheerio';
import { runExampleComServer } from '../../../test/shared/_helper.js';
let serverAddress = 'http://localhost:';
let port;
let server;
beforeAll(async () => {
    [server, port] = await runExampleComServer();
    serverAddress += port;
});
afterAll(() => {
    server.close();
});
describe('CheerioCrawler - XML should be parsed correctly', () => {
    test('should parse XML', async () => {
        let value;
        function handler({ $ }) {
            value = $('item').first().find('link').text();
        }
        const crawler = new CheerioCrawler({
            requestHandler: handler,
        });
        await crawler.run([`${serverAddress}/special/complex-xml`]);
        expect(value).toBeTruthy();
    });
});
