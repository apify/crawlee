import { Session } from '../../build/session_pool/session';
import { SessionPool } from '../../build/session_pool/session_pool';
import EVENTS from '../../build/session_pool/events';
import { STATUS_CODES_BLOCKED } from '../../build/constants';

import Apify from '../../build';
import { getApifyProxyUrl } from '../../build/actor';


describe('Session - testing session behaviour ', () => {
    let sessionPool;
    let session;

    beforeEach(() => {
        sessionPool = new SessionPool();
        session = new Session({ sessionPool });
    });

    test('should markGood session and lower the errorScore', () => {
        expect(session.usageCount).toBe(0);
        expect(session.errorScore).toBe(0);
        session.markGood();
        expect(session.usageCount).toBe(1);
        expect(session.errorScore).toBe(0);
        session.errorScore = 1;
        session.markGood();
        expect(session.errorScore).toBe(0.5);
    });

    test(
        'should throw error when param sessionPool is not EventEmitter instance',
        () => {
            let err;
            try {
                const session = new Session({ sessionPool: {} }); // eslint-disable-line
            } catch (e) {
                err = e;
            }
            expect(err).toBeDefined(); // eslint-disable-line
            expect(err.message.includes('Session: sessionPool must be instance of SessionPool')).toBe(true); // eslint-disable-line
        },
    );

    test('should mark session markBad', () => {
        session.markBad();
        expect(session.errorScore).toBe(1);
        expect(session.usageCount).toBe(1);
    });

    test('should expire session', async () => {
        session = new Session({ maxAgeSecs: 1 / 100, sessionPool });
        await Apify.utils.sleep(101);
        expect(session.isExpired()).toBe(true);
        expect(session.isUsable()).toBe(false);
    });

    test('should max out session usage', () => {
        session.maxUsageCount = 1;
        session.markGood();
        expect(session.isMaxUsageCountReached()).toBe(true);
        expect(session.isUsable()).toBe(false);
    });

    test('should block session', () => {
        session.errorScore += session.maxErrorScore;
        expect(session.isBlocked()).toBe(true);
        expect(session.isUsable()).toBe(false);
    });
    test('should not throw on invalid Cookie header', () => {
        let error;

        try {
            session.setCookiesFromResponse({ headers: { Cookie: 'invaldi*{*{*{*-----***@s' } });
        } catch (e) {
            error = e;
        }

        expect(error).toBeUndefined();
    });

    test('should markGood session', () => {
        session.markGood();
        expect(session.usageCount).toBe(1);
        expect(session.isUsable()).toBe(true);
    });

    test('should retire session', () => {
        let discarded = false;
        sessionPool.on(EVENTS.SESSION_RETIRED, (ses) => {
            expect(ses instanceof Session).toBe(true);
            discarded = true;
        });
        session.retire();
        expect(discarded).toBe(true); // eslint-disable-line
        expect(session.usageCount).toBe(1);
    });

    test('should get state', () => {
        const state = session.getState();

        expect(state.id).toBeDefined();
        expect(state.cookieJar).toBeDefined();
        expect(state.userData).toBeDefined();
        expect(state.maxErrorScore).toBeDefined();
        expect(state.errorScoreDecrement).toBeDefined();
        expect(state.expiresAt).toBeDefined();
        expect(state.createdAt).toBeDefined();
        expect(state.usageCount).toBeDefined();
        expect(state.errorScore).toBeDefined();


        Object.entries(state).forEach(([key, value]) => {
            if (session[key] instanceof Date) {
                expect(session[key].toISOString()).toEqual(value);
            } else if (key === 'cookieJar') {
                expect(value).toEqual(session[key].toJSON());
            } else {
                expect(session[key]).toEqual(value);
            }
        });
    });

    test('should be valid proxy session', () => {
        session = new Session({ sessionPool });
        let error;
        try {
            getApifyProxyUrl({ session: session.id, password: '12312' });
        } catch (e) {
            error = e;
        }

        expect(error).toBeUndefined();
    });

    test('should use cookieJar', () => {
        session = new Session({ sessionPool });
        expect(session.cookieJar.setCookie).toBeDefined();
    });

    test('should checkStatus work', () => {
        session = new Session({ sessionPool });
        expect(session.retireOnBlockedStatusCodes(100)).toBeFalsy();
        expect(session.retireOnBlockedStatusCodes(200)).toBeFalsy();
        expect(session.retireOnBlockedStatusCodes(400)).toBeFalsy();
        expect(session.retireOnBlockedStatusCodes(500)).toBeFalsy();
        STATUS_CODES_BLOCKED.forEach((status) => {
            const sess = new Session({ sessionPool });
            let isCalled;
            const call = () => { isCalled = true; };
            sess.retire = call;
            expect(sess.retireOnBlockedStatusCodes(status)).toBeTruthy();
            expect(isCalled).toBeTruthy();
        });
    });

    test('should checkStatus work with custom codes', () => {
        session = new Session({ sessionPool });
        const customStatusCodes = [100, 202, 300];
        expect(session.retireOnBlockedStatusCodes(100, customStatusCodes)).toBeTruthy();
        expect(session.retireOnBlockedStatusCodes(101, customStatusCodes)).toBeFalsy();
        expect(session.retireOnBlockedStatusCodes(200, customStatusCodes)).toBeFalsy();
        expect(session.retireOnBlockedStatusCodes(202, customStatusCodes)).toBeTruthy();
        expect(session.retireOnBlockedStatusCodes(300, customStatusCodes)).toBeTruthy();
        expect(session.retireOnBlockedStatusCodes(400, customStatusCodes)).toBeFalsy();
    });

    test('setPuppeteerCookies should work', () => {
        const url = 'https://example.com';
        const cookies = [
            { name: 'cookie1', value: 'my-cookie' },
            { name: 'cookie2', value: 'your-cookie' },
        ];

        session = new Session({ sessionPool });
        session.setPuppeteerCookies(cookies, url);
        expect(session.getCookieString(url)).toBe('cookie1=my-cookie; cookie2=your-cookie');
    });

    describe('.putResponse & .getCookieString', () => {
        test('should set and update cookies from "set-cookie" header', () => {
            const headers = {};

            headers['set-cookie'] = [
                'CSRF=e8b667; Domain=example.com; Secure ',
                'id=a3fWa; Expires=Wed, Domain=example.com; 21 Oct 2015 07:28:00 GMT',
            ];
            const newSession = new Session({ sessionPool: new SessionPool() });
            const url = 'https://example.com';
            newSession.setCookiesFromResponse({ headers, url });
            let cookies = newSession.getCookieString(url);
            expect(cookies).toEqual('CSRF=e8b667; id=a3fWa');

            const newCookie = 'ABCD=1231231213; Domain=example.com; Secure';

            newSession.setCookiesFromResponse({ headers: { 'set-cookie': newCookie }, url });
            cookies = newSession.getCookieString(url);
            expect(cookies).toEqual('CSRF=e8b667; id=a3fWa; ABCD=1231231213');
        });
    });

    test('should correctly persist and init cookieJar', () => {
        const headers = {};

        headers['set-cookie'] = [
            'CSRF=e8b667; Domain=example.com; Secure ',
            'id=a3fWa; Expires=Wed, Domain=example.com; 21 Oct 2015 07:28:00 GMT',
        ];
        const newSession = new Session({ sessionPool: new SessionPool() });
        const url = 'https://example.com';
        newSession.setCookiesFromResponse({ headers, url });

        const old = newSession.getState();

        old.createdAt = new Date(old.createdAt);
        old.expiresAt = new Date(old.expiresAt);
        const reinitializedSession = new Session({ sessionPool, ...old });
        expect(reinitializedSession.getCookieString(url)).toEqual('CSRF=e8b667; id=a3fWa');
    });
});
