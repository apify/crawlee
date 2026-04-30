import { ProxyConfiguration } from '@crawlee/core';

describe('ProxyConfiguration', () => {
    test('newUrl() should return proxy URL', async () => {
        const proxyConfiguration = new ProxyConfiguration({ proxyUrls: ['http://proxy.com:1111'] });
        expect(proxyConfiguration).toBeInstanceOf(ProxyConfiguration);
        expect(await proxyConfiguration.newUrl()).toBe('http://proxy.com:1111');
    });

    test('newProxyInfo() should return ProxyInfo object', async () => {
        const proxyConfiguration = new ProxyConfiguration({ proxyUrls: ['http://proxy.com:1111'] });
        const url = 'http://proxy.com:1111';

        const proxyInfo = {
            url,
            hostname: 'proxy.com',
            username: '',
            password: '',
            port: '1111',
        };
        expect(await proxyConfiguration.newProxyInfo()).toEqual(proxyInfo);
    });

    test('newProxyInfo() works with special characters', async () => {
        const url = 'http://user%40name:pass%40word@proxy.com:1111';
        const proxyConfiguration = new ProxyConfiguration({ proxyUrls: [url] });

        const proxyInfo = {
            url,
            hostname: 'proxy.com',
            username: 'user@name',
            password: 'pass@word',
            port: '1111',
        };
        expect(await proxyConfiguration.newProxyInfo()).toEqual(proxyInfo);
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
            return customUrls.pop() ?? null;
        };
        const proxyConfiguration = new ProxyConfiguration({
            newUrlFunction,
        });

        // through newUrl()
        expect(await proxyConfiguration.newUrl()).toEqual('http://proxy.com:6666');
        expect(await proxyConfiguration.newUrl()).toEqual('http://proxy.com:5555');
        expect(await proxyConfiguration.newUrl()).toEqual('http://proxy.com:4444');

        // through newProxyInfo()
        expect((await proxyConfiguration.newProxyInfo())!.url).toEqual('http://proxy.com:3333');
        expect((await proxyConfiguration.newProxyInfo())!.url).toEqual('http://proxy.com:2222');
        expect((await proxyConfiguration.newProxyInfo())!.url).toEqual('http://proxy.com:1111');
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
            return customUrls.pop() ?? null;
        };
        const proxyConfiguration = new ProxyConfiguration({
            newUrlFunction,
        });

        // through newUrl()
        expect(await proxyConfiguration.newUrl()).toEqual('http://proxy.com:6666');
        expect(await proxyConfiguration.newUrl()).toEqual('http://proxy.com:5555');
        expect(await proxyConfiguration.newUrl()).toEqual('http://proxy.com:4444');

        // through newProxyInfo()
        expect((await proxyConfiguration.newProxyInfo())!.url).toEqual('http://proxy.com:3333');
        expect((await proxyConfiguration.newProxyInfo())!.url).toEqual('http://proxy.com:2222');
        expect((await proxyConfiguration.newProxyInfo())!.url).toEqual('http://proxy.com:1111');
    });

    describe('With proxyUrls options', () => {
        test('should rotate custom URLs correctly', async () => {
            const proxyConfiguration = new ProxyConfiguration({
                proxyUrls: ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'],
            });

            // @ts-expect-error private property
            const proxyUrls = proxyConfiguration.proxyUrls!;
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
            const proxyUrls = proxyConfiguration.proxyUrls!;
            expect((await proxyConfiguration.newProxyInfo())!.url).toEqual(proxyUrls[0]);
            expect((await proxyConfiguration.newProxyInfo())!.url).toEqual(proxyUrls[1]);
            expect((await proxyConfiguration.newProxyInfo())!.url).toEqual(proxyUrls[2]);
            expect((await proxyConfiguration.newProxyInfo())!.url).toEqual(proxyUrls[0]);
            expect((await proxyConfiguration.newProxyInfo())!.url).toEqual(proxyUrls[1]);
            expect((await proxyConfiguration.newProxyInfo())!.url).toEqual(proxyUrls[2]);
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
});
