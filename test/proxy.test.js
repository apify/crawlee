
import sinon from 'sinon';
import { ENV_VARS, LOCAL_ENV_VARS } from 'apify-shared/consts';
import Apify from '../build/index';
import * as requestUtils from '../build/utils_request';
import * as utils from '../build/utils';

const { apifyClient } = utils;

const groups = ['GROUP1', 'GROUP2'];
const hostname = 'proxy.apify.com';
const port = 8000;
const password = 'test12345';
const country = 'CZ';
const sessionId = 538909250932;
const basciOpts = {
    groups,
    country,
    password,
    hostname,
    port,
};

describe('Apify.ProxyConfiguration', () => {
    test('should accept all options', () => {
        const proxyConfiguration = new Apify.ProxyConfiguration(basciOpts);

        expect(proxyConfiguration).toBeInstanceOf(Apify.ProxyConfiguration);
        expect(proxyConfiguration.groups).toBe(groups);
        expect(proxyConfiguration.country).toBe(country);
        expect(proxyConfiguration.password).toBe(password);
        expect(proxyConfiguration.hostname).toBe(hostname);
        expect(proxyConfiguration.port).toBe(port);
    });

    test('should getUrl() work', () => {
        const proxyConfiguration = new Apify.ProxyConfiguration(basciOpts);

        const proxyUrl = 'http://groups-GROUP1+GROUP2,session-538909250932,country-CZ:test12345@proxy.apify.com:8000';
        expect(proxyConfiguration.getUrl(sessionId)).toBe(proxyUrl);
    });

    test('should getInfo() work', () => {
        const proxyConfiguration = new Apify.ProxyConfiguration(basciOpts);
        const url = 'http://groups-GROUP1+GROUP2,session-538909250932,country-CZ:test12345@proxy.apify.com:8000';

        const proxy = {
            sessionId,
            url,
            groups,
            country,
            password,
            hostname,
            port,
        };
        expect(proxyConfiguration.getInfo(sessionId)).toStrictEqual(proxy);
    });

    test('should throw invalid arguments structure', () => {
        let opts;
        // Group value
        const invalidGroups = ['GROUP1*'];
        opts = Object.assign({}, basciOpts);
        opts.groups = invalidGroups;
        try {
            // eslint-disable-next-line no-unused-vars
            const proxyConfiguration = new Apify.ProxyConfiguration(opts);
            throw new Error('wrong error');
        } catch (err) {
            expect(err.message).not.toBe('wrong error');
            expect(err.message).toMatch('The "GROUP1*" group option');
        }

        // Country code
        const invalidCountryCode = 'CZE';
        opts = Object.assign({}, basciOpts);
        opts.country = invalidCountryCode;
        try {
            // eslint-disable-next-line no-unused-vars
            const proxyConfiguration = new Apify.ProxyConfiguration(opts);
            throw new Error('wrong error');
        } catch (err) {
            expect(err.message).not.toBe('wrong error');
            expect(err.message).toMatch('The "CZE" option');
        }
    });

    test('should throw missing param error', () => {
        let opts;
        // Missing hostname
        opts = Object.assign({}, basciOpts);
        opts.hostname = null;
        try {
            // eslint-disable-next-line no-unused-vars
            const proxyConfiguration = new Apify.ProxyConfiguration(opts);
            throw new Error('wrong error');
        } catch (err) {
            expect(err.message).not.toBe('wrong error');
            expect(err.message).toMatch('Apify Proxy hostname must be provided');
        }

        // Missing port
        opts = Object.assign({}, basciOpts);
        opts.port = null;
        try {
            // eslint-disable-next-line no-unused-vars
            const proxyConfiguration = new Apify.ProxyConfiguration(opts);
            throw new Error('wrong error');
        } catch (err) {
            expect(err.message).not.toBe('wrong error');
            expect(err.message).toMatch('Apify Proxy port must be provided');
        }
    });
});

describe('Apify.createProxyConfiguration()', () => {
    test('should work with all options', async () => {
        const mock = sinon.mock(requestUtils);
        const status = JSON.stringify({ connected: 'true' });
        const proxyUrl = 'http://groups-GROUP1+GROUP2,country-CZ:test12345@proxy.apify.com:8000';
        const countryCode = country;
        const url = 'http://proxy.apify.com/?format=json';

        mock.expects('requestAsBrowser')
            .once()
            .withArgs({ url, proxyUrl, countryCode })
            .resolves({ body: status });

        const proxyConfiguration = await Apify.createProxyConfiguration(basciOpts);

        expect(proxyConfiguration).toBeInstanceOf(Apify.ProxyConfiguration);
        expect(proxyConfiguration.groups).toBe(groups);
        expect(proxyConfiguration.country).toBe(country);
        expect(proxyConfiguration.password).toBe(password);
        expect(proxyConfiguration.hostname).toBe(hostname);
        expect(proxyConfiguration.port).toBe(port);

        mock.verify();
    });

    test('should work without password (with token)', async () => {
        const opts = basciOpts;
        opts.password = null;

        const requestUtilsMock = sinon.mock(requestUtils);
        const status = JSON.stringify({ connected: 'true' });
        const proxyUrl = 'http://groups-GROUP1+GROUP2,country-CZ:test12345@proxy.apify.com:8000';
        const countryCode = country;
        const url = 'http://proxy.apify.com/?format=json';

        requestUtilsMock.expects('requestAsBrowser')
            .once()
            .withArgs({ url, proxyUrl, countryCode })
            .resolves({ body: status });

        const clientUsersMock = sinon.mock(apifyClient.users);
        const token = '123456789';
        process.env.APIFY_TOKEN = token;
        const availableGroups = [{ name: 'GROUP1' }, { name: 'GROUP2' }];
        const data = { proxy: { password, groups: availableGroups } };

        clientUsersMock.expects('getUser')
            .once()
            .withArgs({ token, userId: 'me' })
            .returns(Promise.resolve(data));


        const proxyConfiguration = await Apify.createProxyConfiguration(opts);

        expect(proxyConfiguration).toBeInstanceOf(Apify.ProxyConfiguration);
        expect(proxyConfiguration.groups).toBe(groups);
        expect(proxyConfiguration.availableGroups).toBe(availableGroups);
        expect(proxyConfiguration.country).toBe(country);
        expect(proxyConfiguration.password).toBe(password);
        expect(proxyConfiguration.hostname).toBe(hostname);
        expect(proxyConfiguration.port).toBe(port);

        requestUtilsMock.verify();
        clientUsersMock.verify();
    });

    test('should throw missing password', async () => {
        delete process.env[ENV_VARS.PROXY_PASSWORD];
        delete process.env[ENV_VARS.TOKEN];
        delete LOCAL_ENV_VARS[ENV_VARS.TOKEN];

        const status = JSON.stringify({ connected: 'true' });

        const fakeCall = async () => {
            return { body: status };
        };

        const stub = sinon.stub(requestUtils, 'requestAsBrowser').callsFake(fakeCall);

        try {
            // eslint-disable-next-line no-unused-vars
            const proxyConfiguration = await Apify.createProxyConfiguration();
            throw new Error('wrong error');
        } catch (err) {
            expect(err.message).not.toBe('wrong error');
            expect(err.message).toMatch('Apify Proxy password must be provided');
        }
        stub.restore();
    });

    test('should throw group is not available', async () => {
        delete process.env[ENV_VARS.PROXY_PASSWORD];
        process.env.APIFY_TOKEN = '123456789';
        const availableGroups = [{ name: 'GROUP1' }];
        const status = JSON.stringify({ connected: 'true' });
        const fakeUserObjectProxyData = { password, groups: availableGroups };

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
            expect(err.message).not.toBe('wrong error');
            expect(err.message).toMatch('The proxy group "GROUP2" is not available');
        }
        stub1.restore();
        stub2.restore();
    });

    test('should throw apify proxy access denied', async () => {
        process.env[ENV_VARS.PROXY_PASSWORD] = password;
        const status = JSON.stringify({ connected: false });
        const fakeRequestAsBrowser = async () => {
            return { body: status };
        };
        const stub = sinon.stub(requestUtils, 'requestAsBrowser').callsFake(fakeRequestAsBrowser);

        try {
            // eslint-disable-next-line no-unused-vars
            const proxyConfiguration = await Apify.createProxyConfiguration();
            throw new Error('wrong error');
        } catch (err) {
            expect(err.message).not.toBe('wrong error');
            expect(err.message).toMatch('You do not have access to Apify Proxy.');
        }
        stub.restore();
    });
});
