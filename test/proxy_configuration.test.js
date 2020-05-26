import sinon from 'sinon';
import { ENV_VARS, LOCAL_ENV_VARS } from 'apify-shared/consts';
import Apify from '../build/index';
import * as requestUtils from '../build/utils_request';
import * as utils from '../build/utils';
import { ProxyConfiguration } from '../build/proxy_configuration';
import log from '../build/utils_log';

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

    test('getUrl() should return proxy URL', () => {
        const proxyConfiguration = new ProxyConfiguration(basicOpts);

        expect(proxyConfiguration.getUrl(sessionId)).toBe(basicOptsProxyUrl);
    });

    test('getInfo() should return ProxyInfo object', () => {
        const proxyConfiguration = new ProxyConfiguration(basicOpts);
        const url = basicOptsProxyUrl;

        const proxyInfo = {
            sessionId,
            url,
            groups,
            countryCode,
            password,
            hostname,
            port,
        };
        expect(proxyConfiguration.getInfo(sessionId)).toStrictEqual(proxyInfo);
    });

    test('actor UI input schema should work', () => {
        const apifyProxyGroups = ['GROUP1', 'GROUP2'];
        const apifyProxyCountry = 'CZ';

        const input = {
            useApifyProxy: true,
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
        let opts = Object.assign({}, basicOpts);
        opts.groups = invalidGroups;
        try {
            // eslint-disable-next-line no-unused-vars
            const proxyConfiguration = new ProxyConfiguration(opts);
            throw new Error('wrong error');
        } catch (err) {
            expect(err.message).toMatch('The provided proxy group name "GROUP1*"');
        }

        // Country code
        const invalidCountryCode = 'CZE';
        opts = Object.assign({}, basicOpts);
        opts.countryCode = invalidCountryCode;
        try {
            // eslint-disable-next-line no-unused-vars
            const proxyConfiguration = new ProxyConfiguration(opts);
            throw new Error('wrong error');
        } catch (err) {
            expect(err.message).toMatch('The provided country code "CZE"');
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

    test('getUrl() should throw invalid session argument', () => {
        const proxyConfiguration = new ProxyConfiguration();

        expect(() => proxyConfiguration.getUrl('a-b')).toThrowError();
        expect(() => proxyConfiguration.getUrl('a$b')).toThrowError();
        expect(() => proxyConfiguration.getUrl({})).toThrowError();
        expect(() => proxyConfiguration.getUrl(new Date())).toThrowError();

        expect(() => proxyConfiguration.getUrl('a_b')).not.toThrowError();
        expect(() => proxyConfiguration.getUrl('0.34252352')).not.toThrowError();
        expect(() => proxyConfiguration.getUrl('aaa~BBB')).not.toThrowError();
        expect(() => proxyConfiguration.getUrl('a_1_b')).not.toThrowError();
        expect(() => proxyConfiguration.getUrl('a_2')).not.toThrowError();
        expect(() => proxyConfiguration.getUrl('a')).not.toThrowError();
        expect(() => proxyConfiguration.getUrl('1')).not.toThrowError();
    });
});

describe('Apify.createProxyConfiguration()', () => {
    test('should work with all options', async () => {
        const mock = sinon.mock(requestUtils);
        const status = { connected: true };
        const proxyUrl = proxyUrlNoSession;
        const url = 'http://proxy.apify.com/?format=json';

        mock.expects('requestAsBrowser')
            .once()
            .withArgs({ url, proxyUrl, countryCode, json: true })
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
        const opts = basicOpts;
        opts.password = null;

        const requestUtilsMock = sinon.mock(requestUtils);
        const status = { connected: true };
        const proxyUrl = proxyUrlNoSession;
        const url = 'http://proxy.apify.com/?format=json';

        requestUtilsMock.expects('requestAsBrowser')
            .once()
            .withArgs({ url, proxyUrl, countryCode, json: true })
            .resolves({ body: status });

        const clientUsersMock = sinon.mock(apifyClient.users);
        const token = '123456789';
        process.env.APIFY_TOKEN = token;
        const data = { proxy: { password } };

        clientUsersMock.expects('getUser')
            .once()
            .withArgs({ token, userId: 'me' })
            .returns(Promise.resolve(data));


        const proxyConfiguration = await Apify.createProxyConfiguration(opts);

        expect(proxyConfiguration).toBeInstanceOf(ProxyConfiguration);
        expect(proxyConfiguration.groups).toBe(groups);
        expect(proxyConfiguration.countryCode).toBe(countryCode);
        expect(proxyConfiguration.password).toBe(password);
        expect(proxyConfiguration.hostname).toBe(hostname);
        expect(proxyConfiguration.port).toBe(port);

        requestUtilsMock.verify();
        clientUsersMock.verify();
    });

    test('should show warning log', async () => {
        const logMock = sinon.mock(log);
        process.env.APIFY_TOKEN = '123456789';

        const status = { connected: true };
        const fakeUserObjectProxyData = { password: '987654321' };

        const fakeRequestAsBrowser = async () => {
            return { body: status };
        };
        const stub1 = sinon.stub(requestUtils, 'requestAsBrowser').callsFake(fakeRequestAsBrowser);

        const fakeGetUser = async () => {
            return { proxy: fakeUserObjectProxyData };
        };
        const stub2 = sinon.stub(apifyClient.users, 'getUser').callsFake(fakeGetUser);

        // eslint-disable-next-line no-unused-vars
        const proxyConfiguration = await Apify.createProxyConfiguration(basicOpts);

        logMock.expects('warning').once();

        stub1.restore();
        stub2.restore();
        logMock.restore();
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
            // eslint-disable-next-line no-unused-vars
            const proxyConfiguration = await Apify.createProxyConfiguration();
            throw new Error('wrong error');
        } catch (err) {
            expect(err.message).toMatch('Apify Proxy password must be provided');
        }
        stub.restore();
    });

    test('should throw when group is not available', async () => {
        delete process.env[ENV_VARS.PROXY_PASSWORD];
        process.env.APIFY_TOKEN = '123456789';
        const connectionError = 'Invalid username: proxy group &quot;GROUP2&quot; not found or not accessible.';
        const status = { connected: false, connectionError };
        const fakeUserObjectProxyData = { password };

        const fakeRequestAsBrowser = async () => {
            return { body: status };
        };
        const stub1 = sinon.stub(requestUtils, 'requestAsBrowser').callsFake(fakeRequestAsBrowser);


        const fakeGetUser = async () => {
            return { proxy: fakeUserObjectProxyData };
        };
        const stub2 = sinon.stub(apifyClient.users, 'getUser').callsFake(fakeGetUser);

        try {
            // eslint-disable-next-line no-unused-vars
            const proxyConfiguration = await Apify.createProxyConfiguration({ groups });
            throw new Error('wrong error');
        } catch (err) {
            expect(err.message).toMatch(connectionError);
        }
        stub1.restore();
        stub2.restore();
    });
});
