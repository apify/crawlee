import { fetchManifest, MANIFEST_URL } from '@crawlee/templates';
import nock from 'nock';

describe('fetchManifest()', () => {
    beforeAll(() => {
        nock.disableNetConnect();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    afterAll(() => {
        nock.enableNetConnect();
    });

    test('loads the manifest and template files from the v3 maintenance branch', async () => {
        const scope = nock('https://raw.githubusercontent.com')
            .get('/apify/crawlee/3.x/packages/templates/manifest.json')
            .reply(200, {
                templates: [
                    {
                        name: 'cheerio-js',
                        description: 'CheerioCrawler template project [JavaScript]',
                        files: ['src/main.js', 'src/routes.js', 'package.json', '.gitignore'],
                    },
                    {
                        name: 'empty-ts',
                        description: 'Empty project [TypeScript]',
                        files: ['src/main.ts', 'tsconfig.json'],
                    },
                ],
            });

        await expect(fetchManifest()).resolves.toEqual({
            templates: [
                {
                    name: 'cheerio-js',
                    description: 'CheerioCrawler template project [JavaScript]',
                    files: [
                        {
                            path: 'src/main.js',
                            url: 'https://raw.githubusercontent.com/apify/crawlee/3.x/packages/templates/templates/cheerio-js/src/main.js',
                        },
                        {
                            path: 'src/routes.js',
                            url: 'https://raw.githubusercontent.com/apify/crawlee/3.x/packages/templates/templates/cheerio-js/src/routes.js',
                        },
                        {
                            path: 'package.json',
                            url: 'https://raw.githubusercontent.com/apify/crawlee/3.x/packages/templates/templates/cheerio-js/package.json',
                        },
                        {
                            path: '.gitignore',
                            url: 'https://raw.githubusercontent.com/apify/crawlee/3.x/packages/templates/templates/cheerio-js/.gitignore',
                        },
                    ],
                },
                {
                    name: 'empty-ts',
                    description: 'Empty project [TypeScript]',
                    files: [
                        {
                            path: 'src/main.ts',
                            url: 'https://raw.githubusercontent.com/apify/crawlee/3.x/packages/templates/templates/empty-ts/src/main.ts',
                        },
                        {
                            path: 'tsconfig.json',
                            url: 'https://raw.githubusercontent.com/apify/crawlee/3.x/packages/templates/templates/empty-ts/tsconfig.json',
                        },
                    ],
                },
            ],
        });
        scope.done();
    });

    test('rejects unsuccessful manifest responses', async () => {
        const scope = nock('https://raw.githubusercontent.com')
            .get(new URL(MANIFEST_URL).pathname)
            .reply(503, 'Unavailable');

        await expect(fetchManifest()).rejects.toThrow('Status: 503\nUnavailable');
        scope.done();
    });

    test('rejects malformed manifest JSON', async () => {
        const scope = nock('https://raw.githubusercontent.com').get(new URL(MANIFEST_URL).pathname).reply(200, '{');

        await expect(fetchManifest()).rejects.toThrow(SyntaxError);
        scope.done();
    });
});
