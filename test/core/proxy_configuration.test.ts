import { ProxyConfiguration, Request } from '@crawlee/core';

const sessionId = 538909250932;

describe('ProxyConfiguration', () => {
    test('newUrl() should return proxy URL', async () => {
        const proxyConfiguration = new ProxyConfiguration({ proxyUrls: ['http://proxy.com:1111'] });
        expect(proxyConfiguration).toBeInstanceOf(ProxyConfiguration);
        expect(await proxyConfiguration.newUrl(sessionId)).toBe('http://proxy.com:1111');
    });

    test('newProxyInfo() should return ProxyInfo object', async () => {
        const proxyConfiguration = new ProxyConfiguration({ proxyUrls: ['http://proxy.com:1111'] });
        const url = 'http://proxy.com:1111';

        const proxyInfo = {
            sessionId: `${sessionId}`,
            url,
            hostname: 'proxy.com',
            username: '',
            password: '',
            port: '1111',
        };
        expect(await proxyConfiguration.newProxyInfo(sessionId)).toEqual(proxyInfo);
    });

    test('should throw on invalid newUrlFunction', async () => {
        const newUrlFunction = () => {
            return 'http://proxy.com:1111*invalid_url';
        };
        const proxyConfiguration = new ProxyConfiguration({
            newUrlFunction,
        });
        try {
            await proxyConfiguration.newUrl();
            throw new Error('wrong error');
        } catch (err) {
            expect((err as Error).message).toMatch('The provided newUrlFunction did not return');
        }
    });

    test('newUrlFunction should correctly generate URLs', async () => {
        const customUrls = [
            'http://proxy.com:1111',
            'http://proxy.com:2222',
            'http://proxy.com:3333',
            'http://proxy.com:4444',
            'http://proxy.com:5555',
            'http://proxy.com:6666',
        ];
        const newUrlFunction = () => {
            return customUrls.pop();
        };
        const proxyConfiguration = new ProxyConfiguration({
            newUrlFunction,
        });

        // through newUrl()
        expect(await proxyConfiguration.newUrl()).toEqual('http://proxy.com:6666');
        expect(await proxyConfiguration.newUrl()).toEqual('http://proxy.com:5555');
        expect(await proxyConfiguration.newUrl()).toEqual('http://proxy.com:4444');

        // through newProxyInfo()
        expect((await proxyConfiguration.newProxyInfo()).url).toEqual('http://proxy.com:3333');
        expect((await proxyConfiguration.newProxyInfo()).url).toEqual('http://proxy.com:2222');
        expect((await proxyConfiguration.newProxyInfo()).url).toEqual('http://proxy.com:1111');
    });

    test('async newUrlFunction should work correctly', async () => {
        const customUrls = [
            'http://proxy.com:1111',
            'http://proxy.com:2222',
            'http://proxy.com:3333',
            'http://proxy.com:4444',
            'http://proxy.com:5555',
            'http://proxy.com:6666',
        ];
        const newUrlFunction = async () => {
            await new Promise((r) => setTimeout(r, 5));
            return customUrls.pop();
        };
        const proxyConfiguration = new ProxyConfiguration({
            newUrlFunction,
        });

        // through newUrl()
        expect(await proxyConfiguration.newUrl()).toEqual('http://proxy.com:6666');
        expect(await proxyConfiguration.newUrl()).toEqual('http://proxy.com:5555');
        expect(await proxyConfiguration.newUrl()).toEqual('http://proxy.com:4444');

        // through newProxyInfo()
        expect((await proxyConfiguration.newProxyInfo()).url).toEqual('http://proxy.com:3333');
        expect((await proxyConfiguration.newProxyInfo()).url).toEqual('http://proxy.com:2222');
        expect((await proxyConfiguration.newProxyInfo()).url).toEqual('http://proxy.com:1111');
    });

    describe('With proxyUrls options', () => {
        test('should rotate custom URLs correctly', async () => {
            const proxyConfiguration = new ProxyConfiguration({
                proxyUrls: ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'],
            });

            // @ts-expect-error private property
            const { proxyUrls } = proxyConfiguration;
            expect(await proxyConfiguration.newUrl()).toEqual(proxyUrls[0]);
            expect(await proxyConfiguration.newUrl()).toEqual(proxyUrls[1]);
            expect(await proxyConfiguration.newUrl()).toEqual(proxyUrls[2]);
            expect(await proxyConfiguration.newUrl()).toEqual(proxyUrls[0]);
            expect(await proxyConfiguration.newUrl()).toEqual(proxyUrls[1]);
            expect(await proxyConfiguration.newUrl()).toEqual(proxyUrls[2]);
        });

        test('newProxyInfo() should return correctly rotated URL', async () => {
            const proxyConfiguration = new ProxyConfiguration({
                proxyUrls: ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'],
            });

            // @ts-expect-error TODO private property?
            const { proxyUrls } = proxyConfiguration;
            expect((await proxyConfiguration.newProxyInfo()).url).toEqual(proxyUrls[0]);
            expect((await proxyConfiguration.newProxyInfo()).url).toEqual(proxyUrls[1]);
            expect((await proxyConfiguration.newProxyInfo()).url).toEqual(proxyUrls[2]);
            expect((await proxyConfiguration.newProxyInfo()).url).toEqual(proxyUrls[0]);
            expect((await proxyConfiguration.newProxyInfo()).url).toEqual(proxyUrls[1]);
            expect((await proxyConfiguration.newProxyInfo()).url).toEqual(proxyUrls[2]);
        });

        test('should rotate custom URLs with sessions correctly', async () => {
            const sessions = ['sesssion_01', 'sesssion_02', 'sesssion_03', 'sesssion_04', 'sesssion_05', 'sesssion_06'];
            const proxyConfiguration = new ProxyConfiguration({
                proxyUrls: ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'],
            });

            // @ts-expect-error TODO private property?
            const { proxyUrls } = proxyConfiguration;
            // should use same proxy URL
            expect(await proxyConfiguration.newUrl(sessions[0])).toEqual(proxyUrls[0]);
            expect(await proxyConfiguration.newUrl(sessions[0])).toEqual(proxyUrls[0]);
            expect(await proxyConfiguration.newUrl(sessions[0])).toEqual(proxyUrls[0]);

            // should rotate different proxies
            expect(await proxyConfiguration.newUrl(sessions[1])).toEqual(proxyUrls[1]);
            expect(await proxyConfiguration.newUrl(sessions[2])).toEqual(proxyUrls[2]);
            expect(await proxyConfiguration.newUrl(sessions[3])).toEqual(proxyUrls[0]);
            expect(await proxyConfiguration.newUrl(sessions[4])).toEqual(proxyUrls[1]);
            expect(await proxyConfiguration.newUrl(sessions[5])).toEqual(proxyUrls[2]);

            // should remember already used session
            expect(await proxyConfiguration.newUrl(sessions[1])).toEqual(proxyUrls[1]);
            expect(await proxyConfiguration.newUrl(sessions[3])).toEqual(proxyUrls[0]);
        });

        test('should throw cannot combine custom methods', async () => {
            const proxyUrls = ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'];
            const newUrlFunction = () => {
                return proxyUrls[Math.floor(Math.random() * proxyUrls.length)];
            };
            try {
                const proxyConfiguration = new ProxyConfiguration({
                    proxyUrls,
                    newUrlFunction,
                });
                throw new Error('wrong error');
            } catch (err) {
                expect((err as Error).message).toMatch('Cannot combine custom proxies "options.proxyUrls"');
            }
        });

        test('should throw proxyUrls array is empty', async () => {
            try {
                const proxyConfiguration = new ProxyConfiguration({
                    proxyUrls: [],
                });
                throw new Error('wrong error');
            } catch (err) {
                expect((err as Error).message).toMatch('Expected property array `proxyUrls` to not be empty');
            }
        });

        test('should throw invalid custom URL form', async () => {
            try {
                const proxyConfiguration = new ProxyConfiguration({
                    proxyUrls: ['http://proxy.com:1111*invalid_url'],
                });
                throw new Error('wrong error');
            } catch (err) {
                expect((err as Error).message).toMatch('to be a URL, got `http://proxy.com:1111*invalid_url`');
            }
        });
    });

    describe('with tieredProxyUrls', () => {
        test('without Request rotates the urls uniformly', async () => {
            const proxyConfiguration = new ProxyConfiguration({
                tieredProxyUrls: [
                    ['http://proxy.com:1111', 'http://proxy.com:2222'],
                    ['http://proxy.com:3333', 'http://proxy.com:4444'],
                ],
            });

            // @ts-expect-error protected property
            const { tieredProxyUrls } = proxyConfiguration;
            expect(await proxyConfiguration.newUrl()).toEqual(tieredProxyUrls[0][0]);
            expect(await proxyConfiguration.newUrl()).toEqual(tieredProxyUrls[0][1]);
            expect(await proxyConfiguration.newUrl()).toEqual(tieredProxyUrls[1][0]);
            expect(await proxyConfiguration.newUrl()).toEqual(tieredProxyUrls[1][1]);
            expect(await proxyConfiguration.newUrl()).toEqual(tieredProxyUrls[0][0]);
        });

        test('rotating a request results in higher-level proxies', async () => {
            const proxyConfiguration = new ProxyConfiguration({
                tieredProxyUrls: [['http://proxy.com:1111'], ['http://proxy.com:2222'], ['http://proxy.com:3333']],
            });

            const request = new Request({
                url: 'http://example.com',
            });

            // @ts-expect-error protected property
            const { tieredProxyUrls } = proxyConfiguration;
            expect(await proxyConfiguration.newUrl('session-id', { request })).toEqual(tieredProxyUrls[0][0]);
            expect(await proxyConfiguration.newUrl('session-id', { request })).toEqual(tieredProxyUrls[1][0]);
            expect(await proxyConfiguration.newUrl('session-id', { request })).toEqual(tieredProxyUrls[2][0]);

            // we still get the same (higher) proxy tier even with a new request
            const request2 = new Request({
                url: 'http://example.com/another-resource',
            });

            expect(await proxyConfiguration.newUrl('session-id', { request: request2 })).toEqual(tieredProxyUrls[2][0]);
        });

        test('upshifts and downshifts properly', async () => {
            const tieredProxyUrls = [['http://proxy.com:1111'], ['http://proxy.com:2222'], ['http://proxy.com:3333']];

            const proxyConfiguration = new ProxyConfiguration({
                tieredProxyUrls,
            });

            const request = new Request({
                url: 'http://example.com',
            });

            let gotToTheHighestProxy = false;
            for (let i = 0; i < 10; i++) {
                const lastProxyUrl = await proxyConfiguration.newUrl('session-id', { request });
                if (lastProxyUrl === tieredProxyUrls[2][0]) {
                    gotToTheHighestProxy = true;
                    break;
                }
            }

            expect(gotToTheHighestProxy).toBe(true);

            // Even the highest-tier proxies didn't help - we should try going down
            let gotToTheLowestProxy = false;

            for (let i = 0; i < 20; i++) {
                const lastProxyUrl = await proxyConfiguration.newUrl('session-id', { request });
                if (lastProxyUrl === tieredProxyUrls[0][0]) {
                    gotToTheLowestProxy = true;
                    break;
                }
            }

            expect(gotToTheLowestProxy).toBe(true);
        });

        test('successful requests make the proxy tier drop eventually', async () => {
            const tieredProxyUrls = [['http://proxy.com:1111'], ['http://proxy.com:2222'], ['http://proxy.com:3333']];

            const proxyConfiguration = new ProxyConfiguration({
                tieredProxyUrls,
            });

            const failingRequest = new Request({
                url: 'http://example.com',
            });
            let gotToTheHighestProxy = false;

            for (let i = 0; i < 10; i++) {
                const lastProxyUrl = await proxyConfiguration.newUrl('session-id', { request: failingRequest });

                if (lastProxyUrl === tieredProxyUrls[2][0]) {
                    gotToTheHighestProxy = true;
                    break;
                }
            }

            expect(gotToTheHighestProxy).toBe(true);

            let gotToTheLowestProxy = false;

            for (let i = 0; i < 100; i++) {
                const lastProxyUrl = await proxyConfiguration.newUrl('session-id', {
                    request: new Request({ url: `http://example.com/${i}` }),
                });

                if (lastProxyUrl === tieredProxyUrls[0][0]) {
                    gotToTheLowestProxy = true;
                    break;
                }
            }

            expect(gotToTheLowestProxy).toBe(true);
        });
    });
});
