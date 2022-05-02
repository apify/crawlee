import sinon from 'sinon';
import { ENV_VARS, LOCAL_ENV_VARS } from '@apify/consts';
import Apify from '../build/index';
import * as requestUtils from '../build/utils_request';
import * as utils from '../build/utils';
import { ProxyConfiguration } from '../build/proxy_configuration';

const { apifyClient } = utils;

const groups = ['GROUP1', 'GROUP2'];
const hostname = LOCAL_ENV_VARS[ENV_VARS.PROXY_HOSTNAME];
const port = Number(LOCAL_ENV_VARS[ENV_VARS.PROXY_PORT]);
const password = 'test12345';
const countryCode = 'CZ';
const sessionId = 538909250932;
const basicOpts = {
    groups,
    countryCode,
    password,
};
const basicOptsProxyUrl = 'http://groups-GROUP1+GROUP2,session-538909250932,country-CZ:test12345@proxy.apify.com:8000';
const proxyUrlNoSession = 'http://groups-GROUP1+GROUP2,country-CZ:test12345@proxy.apify.com:8000';

afterEach(() => {
    delete process.env[ENV_VARS.TOKEN];
    delete process.env[ENV_VARS.PROXY_PASSWORD];
    delete process.env[ENV_VARS.PROXY_HOSTNAME];
    delete process.env[ENV_VARS.PROXY_STATUS_URL];
});

describe('ProxyConfiguration', () => {
    test('should accept all options', () => {
        const proxyConfiguration = new ProxyConfiguration(basicOpts);

        expect(proxyConfiguration).toBeInstanceOf(ProxyConfiguration);
        expect(proxyConfiguration.groups).toBe(groups);
        expect(proxyConfiguration.countryCode).toBe(countryCode);
        expect(proxyConfiguration.password).toBe(password);
        expect(proxyConfiguration.hostname).toBe(hostname);
        expect(proxyConfiguration.port).toBe(port);
    });

    test('newUrl() should return proxy URL', () => {
        const proxyConfiguration = new ProxyConfiguration(basicOpts);

        expect(proxyConfiguration.newUrl(sessionId)).toBe(basicOptsProxyUrl);
    });

    test('newProxyInfo() should return ProxyInfo object', () => {
        const proxyConfiguration = new ProxyConfiguration(basicOpts);
        const url = basicOptsProxyUrl;

        const proxyInfo = {
            sessionId: `${sessionId}`,
            url,
            groups,
            countryCode,
            password,
            hostname,
            port,
        };
        expect(proxyConfiguration.newProxyInfo(sessionId)).toStrictEqual(proxyInfo);
    });

    test('actor UI input schema should work', () => {
        const apifyProxyGroups = ['GROUP1', 'GROUP2'];
        const apifyProxyCountry = 'CZ';

        const input = {
            apifyProxyGroups,
            apifyProxyCountry,
        };

        const proxyConfiguration = new ProxyConfiguration(input);

        expect(proxyConfiguration.groups).toStrictEqual(apifyProxyGroups);
        expect(proxyConfiguration.countryCode).toStrictEqual(apifyProxyCountry);
    });

    test('should throw on invalid arguments structure', () => {
        // Group value
        const invalidGroups = ['GROUP1*'];
        let opts = { ...basicOpts };
        opts.groups = invalidGroups;
        try {
            // eslint-disable-next-line no-unused-vars
            const proxyConfiguration = new ProxyConfiguration(opts);
            throw new Error('wrong error');
        } catch (err) {
            expect(err.message).toMatch('got `GROUP1*` in object');
        }

        // Country code
        const invalidCountryCode = 'CZE';
        opts = { ...basicOpts };
        opts.countryCode = invalidCountryCode;
        try {
            // eslint-disable-next-line no-unused-vars
            const proxyConfiguration = new ProxyConfiguration(opts);
            throw new Error('wrong error');
        } catch (err) {
            expect(err.message).toMatch('got `CZE` in object');
        }
    });

    test('should throw on invalid groups and countryCode args', async () => {
        expect(() => new ProxyConfiguration({ groups: [new Date()] })).toThrowError();
        expect(() => new ProxyConfiguration({ groups: [{}, 'fff', 'ccc'] })).toThrowError();
        expect(() => new ProxyConfiguration({ groups: ['ffff', 'ff-hf', 'ccc'] })).toThrowError();
        expect(() => new ProxyConfiguration({ groups: ['ffff', 'fff', 'cc$c'] })).toThrowError();
        expect(() => new ProxyConfiguration({ apifyProxyGroups: [new Date()] })).toThrowError();

        expect(() => new ProxyConfiguration({ countryCode: new Date() })).toThrow();
        expect(() => new ProxyConfiguration({ countryCode: 'aa' })).toThrow();
        expect(() => new ProxyConfiguration({ countryCode: 'aB' })).toThrow();
        expect(() => new ProxyConfiguration({ countryCode: 'Ba' })).toThrow();
        expect(() => new ProxyConfiguration({ countryCode: '11' })).toThrow();
        expect(() => new ProxyConfiguration({ countryCode: 'DDDD' })).toThrow();
        expect(() => new ProxyConfiguration({ countryCode: 'dddd' })).toThrow();
        expect(() => new ProxyConfiguration({ countryCode: 1111 })).toThrow();
    });

    test('newUrl() should throw on invalid session argument', () => {
        const proxyConfiguration = new ProxyConfiguration();

        expect(() => proxyConfiguration.newUrl('a-b')).toThrowError();
        expect(() => proxyConfiguration.newUrl('a$b')).toThrowError();
        expect(() => proxyConfiguration.newUrl({})).toThrowError();
        expect(() => proxyConfiguration.newUrl(new Date())).toThrowError();
        expect(() => proxyConfiguration.newUrl(Array(51).fill('x').join(''))).toThrowError();

        expect(() => proxyConfiguration.newUrl('a_b')).not.toThrowError();
        expect(() => proxyConfiguration.newUrl('0.34252352')).not.toThrowError();
        expect(() => proxyConfiguration.newUrl('aaa~BBB')).not.toThrowError();
        expect(() => proxyConfiguration.newUrl('a_1_b')).not.toThrowError();
        expect(() => proxyConfiguration.newUrl('a_2')).not.toThrowError();
        expect(() => proxyConfiguration.newUrl('a')).not.toThrowError();
        expect(() => proxyConfiguration.newUrl('1')).not.toThrowError();
        expect(() => proxyConfiguration.newUrl(123456)).not.toThrowError();
        expect(() => proxyConfiguration.newUrl(Array(50).fill('x').join(''))).not.toThrowError();
    });

    test('should throw on invalid newUrlFunction', async () => {
        const newUrlFunction = () => {
            return 'http://proxy.com:1111*invalid_url';
        };
        const proxyConfiguration = new ProxyConfiguration({
            newUrlFunction,
        });
        try {
            proxyConfiguration.newUrl();
            throw new Error('wrong error');
        } catch (err) {
            expect(err.message).toMatch('The provided newUrlFunction did not return');
        }
    });

    test('newUrlFunction should correctly generate URLs', async () => {
        const customUrls = ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333',
            'http://proxy.com:4444', 'http://proxy.com:5555', 'http://proxy.com:6666'];
        const newUrlFunction = () => {
            return customUrls.pop();
        };
        const proxyConfiguration = new ProxyConfiguration({
            newUrlFunction,
        });

        // through newUrl()
        expect(proxyConfiguration.newUrl()).toEqual('http://proxy.com:6666');
        expect(proxyConfiguration.newUrl()).toEqual('http://proxy.com:5555');
        expect(proxyConfiguration.newUrl()).toEqual('http://proxy.com:4444');

        // through newProxyInfo()
        expect(proxyConfiguration.newProxyInfo().url).toEqual('http://proxy.com:3333');
        expect(proxyConfiguration.newProxyInfo().url).toEqual('http://proxy.com:2222');
        expect(proxyConfiguration.newProxyInfo().url).toEqual('http://proxy.com:1111');
    });

    describe('With proxyUrls options', () => {
        test('should rotate custom URLs correctly', async () => {
            const proxyConfiguration = new ProxyConfiguration({
                proxyUrls: ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'],
            });

            const { proxyUrls } = proxyConfiguration;
            expect(proxyConfiguration.newUrl()).toEqual(proxyUrls[0]);
            expect(proxyConfiguration.newUrl()).toEqual(proxyUrls[1]);
            expect(proxyConfiguration.newUrl()).toEqual(proxyUrls[2]);
            expect(proxyConfiguration.newUrl()).toEqual(proxyUrls[0]);
            expect(proxyConfiguration.newUrl()).toEqual(proxyUrls[1]);
            expect(proxyConfiguration.newUrl()).toEqual(proxyUrls[2]);
        });

        test('newProxyInfo() should return correctly rotated URL', async () => {
            const proxyConfiguration = new ProxyConfiguration({
                proxyUrls: ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'],
            });

            const { proxyUrls } = proxyConfiguration;
            expect(proxyConfiguration.newProxyInfo().url).toEqual(proxyUrls[0]);
            expect(proxyConfiguration.newProxyInfo().url).toEqual(proxyUrls[1]);
            expect(proxyConfiguration.newProxyInfo().url).toEqual(proxyUrls[2]);
            expect(proxyConfiguration.newProxyInfo().url).toEqual(proxyUrls[0]);
            expect(proxyConfiguration.newProxyInfo().url).toEqual(proxyUrls[1]);
            expect(proxyConfiguration.newProxyInfo().url).toEqual(proxyUrls[2]);
        });

        test('should rotate custom URLs with sessions correctly', async () => {
            const sessions = ['sesssion_01', 'sesssion_02', 'sesssion_03', 'sesssion_04', 'sesssion_05', 'sesssion_06'];
            const proxyConfiguration = new ProxyConfiguration({
                proxyUrls: ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'],
            });

            const { proxyUrls } = proxyConfiguration;
            // should use same proxy URL
            expect(proxyConfiguration.newUrl(sessions[0])).toEqual(proxyUrls[0]);
            expect(proxyConfiguration.newUrl(sessions[0])).toEqual(proxyUrls[0]);
            expect(proxyConfiguration.newUrl(sessions[0])).toEqual(proxyUrls[0]);

            // should rotate different proxies
            expect(proxyConfiguration.newUrl(sessions[1])).toEqual(proxyUrls[1]);
            expect(proxyConfiguration.newUrl(sessions[2])).toEqual(proxyUrls[2]);
            expect(proxyConfiguration.newUrl(sessions[3])).toEqual(proxyUrls[0]);
            expect(proxyConfiguration.newUrl(sessions[4])).toEqual(proxyUrls[1]);
            expect(proxyConfiguration.newUrl(sessions[5])).toEqual(proxyUrls[2]);

            // should remember already used session
            expect(proxyConfiguration.newUrl(sessions[1])).toEqual(proxyUrls[1]);
            expect(proxyConfiguration.newUrl(sessions[3])).toEqual(proxyUrls[0]);
        });

        test('should throw cannot combine custom proxies with Apify Proxy', async () => {
            const proxyUrls = ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'];
            const newUrlFunction = () => {
                return proxyUrls[Math.floor(Math.random() * proxyUrls.length)];
            };
            try {
                // eslint-disable-next-line no-unused-vars
                const proxyConfiguration = new ProxyConfiguration({
                    groups: ['GROUP1'],
                    proxyUrls,
                });
                throw new Error('wrong error');
            } catch (err) {
                expect(err.message).toMatch('Cannot combine custom proxies with Apify Proxy!');
            }

            try {
                // eslint-disable-next-line no-unused-vars
                const proxyConfiguration = new ProxyConfiguration({
                    groups: ['GROUP1'],
                    newUrlFunction,
                });
                throw new Error('wrong error');
            } catch (err) {
                expect(err.message).toMatch('Cannot combine custom proxies with Apify Proxy!');
            }
        });

        test('should throw cannot combine custom methods', async () => {
            const proxyUrls = ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'];
            const newUrlFunction = () => {
                return proxyUrls[Math.floor(Math.random() * proxyUrls.length)];
            };
            try {
                // eslint-disable-next-line no-unused-vars
                const proxyConfiguration = new ProxyConfiguration({
                    proxyUrls,
                    newUrlFunction,
                });
                throw new Error('wrong error');
            } catch (err) {
                expect(err.message).toMatch('Cannot combine custom proxies "options.proxyUrls"');
            }
        });

        test('should throw proxyUrls array is empty', async () => {
            try {
                // eslint-disable-next-line no-unused-vars
                const proxyConfiguration = new ProxyConfiguration({
                    proxyUrls: [],
                });
                throw new Error('wrong error');
            } catch (err) {
                expect(err.message).toMatch('Expected property array `proxyUrls` to not be empty');
            }
        });

        test('should throw invalid custom URL form', async () => {
            try {
                // eslint-disable-next-line no-unused-vars
                const proxyConfiguration = new ProxyConfiguration({
                    proxyUrls: ['http://proxy.com:1111*invalid_url'],
                });
                throw new Error('wrong error');
            } catch (err) {
                expect(err.message).toMatch('to be a URL, got `http://proxy.com:1111*invalid_url`');
            }
        });
    });
});

describe('Apify.createProxyConfiguration()', () => {
    const userData = { proxy: { password } };

    test('should work with all options', async () => {
        const mock = sinon.mock(requestUtils);
        const status = { connected: true };
        const proxyUrl = proxyUrlNoSession;
        const url = 'http://proxy.apify.com/?format=json';

        mock.expects('requestAsBrowser')
            .once()
            .withArgs(sinon.match({ url, proxyUrl }))
            .resolves({ body: status });

        const proxyConfiguration = await Apify.createProxyConfiguration(basicOpts);

        expect(proxyConfiguration).toBeInstanceOf(ProxyConfiguration);
        expect(proxyConfiguration.groups).toBe(groups);
        expect(proxyConfiguration.countryCode).toBe(countryCode);
        expect(proxyConfiguration.password).toBe(password);
        expect(proxyConfiguration.hostname).toBe(hostname);
        expect(proxyConfiguration.port).toBe(port);

        mock.verify();
    });

    test('should work without password (with token)', async () => {
        const token = '123456789';
        process.env.APIFY_TOKEN = token;
        const opts = { ...basicOpts };
        delete opts.password;

        const requestUtilsMock = sinon.mock(requestUtils);
        const userClientMock = sinon.mock(apifyClient);
        const status = { connected: true };
        const proxyUrl = proxyUrlNoSession;
        const url = 'http://proxy.apify.com/?format=json';

        requestUtilsMock.expects('requestAsBrowser')
            .once()
            .withArgs(sinon.match({ url, proxyUrl }))
            .resolves({ body: status });

        userClientMock.expects('user')
            .once()
            .returns({ get: async () => userData });

        const proxyConfiguration = await Apify.createProxyConfiguration(opts);

        expect(proxyConfiguration).toBeInstanceOf(ProxyConfiguration);
        expect(proxyConfiguration.groups).toBe(groups);
        expect(proxyConfiguration.countryCode).toBe(countryCode);
        expect(proxyConfiguration.password).toBe(password);
        expect(proxyConfiguration.hostname).toBe(hostname);
        expect(proxyConfiguration.port).toBe(port);

        requestUtilsMock.verify();
        userClientMock.verify();
    });

    test('should show warning log', async () => {
        process.env.APIFY_TOKEN = '123456789';

        const status = { connected: true };
        const userClientMock = sinon.mock(apifyClient);
        const stub1 = sinon.stub(requestUtils, 'requestAsBrowser').resolves({ body: status });
        const fakeUserData = { proxy: { password: 'some-other-users-password' } };
        userClientMock.expects('user')
            .once()
            .returns({ get: async () => fakeUserData });

        const proxyConfiguration = new ProxyConfiguration(basicOpts);
        const logMock = sinon.mock(proxyConfiguration.log);
        logMock.expects('warning').once();

        await proxyConfiguration.initialize();

        stub1.restore();
        logMock.verify();
        userClientMock.verify();
    });

    test('should throw missing password', async () => {
        delete process.env[ENV_VARS.PROXY_PASSWORD];
        delete process.env[ENV_VARS.TOKEN];

        const status = { connected: true };

        const fakeCall = async () => {
            return { body: status };
        };

        const stub = sinon.stub(requestUtils, 'requestAsBrowser').callsFake(fakeCall);

        try {
            await Apify.createProxyConfiguration();
            throw new Error('wrong error');
        } catch (err) {
            expect(err.message).toMatch('Apify Proxy password must be provided');
        }
        stub.restore();
    });

    test('should throw when group is not available', async () => {
        delete process.env[ENV_VARS.PROXY_PASSWORD];
        process.env.APIFY_TOKEN = '123456789';
        const connectionError = 'Invalid username: proxy group "GROUP2"; not found or not accessible.';
        const status = { connected: false, connectionError };
        const userClientMock = sinon.mock(apifyClient);

        const fakeRequestAsBrowser = async () => {
            return { body: status };
        };
        const stub1 = sinon.stub(requestUtils, 'requestAsBrowser').callsFake(fakeRequestAsBrowser);

        userClientMock.expects('user')
            .once()
            .returns({ get: async () => userData });

        try {
            await Apify.createProxyConfiguration({ groups });
            throw new Error('wrong error');
        } catch (err) {
            expect(err.message).toMatch(connectionError);
        }
        stub1.restore();
        userClientMock.verify();
    });

    test('should not throw when access check is unresponsive', async () => {
        process.env.APIFY_PROXY_PASSWORD = '123456789';
        const requestUtilsMock = sinon.mock(requestUtils);

        requestUtilsMock.expects('requestAsBrowser')
            .twice()
            .rejects(new Error('some error'));

        const proxyConfiguration = new ProxyConfiguration();
        const logMock = sinon.mock(proxyConfiguration.log);
        logMock.expects('warning').once();

        await proxyConfiguration.initialize();

        requestUtilsMock.verify();
        logMock.verify();
    });

    test('should connect to proxy in environments other than production', async () => {
        process.env.APIFY_PROXY_STATUS_URL = 'http://proxy-domain.apify.com';
        process.env.APIFY_PROXY_HOSTNAME = 'proxy-domain.apify.com';
        process.env.APIFY_PROXY_PASSWORD = password;

        const mock = sinon.mock(requestUtils);
        mock.expects('requestAsBrowser')
            .once()
            .withArgs(sinon.match({
                url: `${process.env.APIFY_PROXY_STATUS_URL}/?format=json`,
                proxyUrl: `http://auto:${password}@${process.env.APIFY_PROXY_HOSTNAME}:8000`,
            }))
            .resolves({ body: { connected: true } });

        await Apify.createProxyConfiguration();

        mock.verify();
    });
});
