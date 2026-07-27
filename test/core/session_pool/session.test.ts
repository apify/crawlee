import { Session } from '@crawlee/core';
import { entries, sleep } from '@crawlee/utils';

describe('Session - testing session behaviour', () => {
    let session: Session;

    beforeEach(() => {
        session = new Session();
    });

    test('should markGood session and lower the errorScore', () => {
        expect(session.usageCount).toBe(0);
        expect(session.errorScore).toBe(0);
        session.markGood();
        expect(session.usageCount).toBe(1);
        expect(session.errorScore).toBe(0);
        // @ts-expect-error Private property
        session._errorScore = 1;
        session.markGood();
        expect(session.errorScore).toBe(0.5);
    });

    test('should mark session markBad', () => {
        session.markBad();
        expect(session.errorScore).toBe(1);
        expect(session.usageCount).toBe(1);
    });

    test('should expire session', async () => {
        session = new Session({ maxAgeSecs: 1 / 100 });
        await sleep(101);
        expect(session.isExpired()).toBe(true);
        expect(session.isUsable()).toBe(false);
    });

    test('should max out session usage', () => {
        // @ts-expect-error Private property
        session._maxUsageCount = 1;
        session.markGood();
        expect(session.isMaxUsageCountReached()).toBe(true);
        expect(session.isUsable()).toBe(false);
    });

    test('should block session', () => {
        // @ts-expect-error Private property
        session._errorScore += session.maxErrorScore;
        expect(session.isBlocked()).toBe(true);
        expect(session.isUsable()).toBe(false);
    });
    test('should markGood session', () => {
        session.markGood();
        expect(session.usageCount).toBe(1);
        expect(session.isUsable()).toBe(true);
    });

    test('should retire session', () => {
        session.retire();
        expect(session.usageCount).toBe(1);
        expect(session.isUsable()).toBe(false);
    });

    test('retired session stays unusable even after markGood', () => {
        session.retire();
        expect(session.isUsable()).toBe(false);

        session.markGood();
        expect(session.isUsable()).toBe(false);
    });

    test('retire() is idempotent', () => {
        session.retire();
        const errorScore = session.errorScore;
        const usageCount = session.usageCount;

        session.retire();
        session.retire();

        expect(session.errorScore).toBe(errorScore);
        expect(session.usageCount).toBe(usageCount);
    });

    test('should retire session after marking bad', () => {
        vitest.spyOn(session, 'retire');
        session.markBad();
        expect(session.retire).toBeCalledTimes(0);
        session.isUsable = () => false;
        session.markBad();
        expect(session.retire).toBeCalledTimes(1);
    });

    test('should retire session after marking good', () => {
        vitest.spyOn(session, 'retire');

        session.markGood();
        expect(session.retire).toBeCalledTimes(0);

        session.isUsable = () => false;
        session.markGood();
        expect(session.retire).toBeCalledTimes(1);
    });

    test('should reevaluate usability of session after marking the session', () => {
        vitest.spyOn(session, 'retire');

        // A usable session is not retired when marked.
        session.markGood();
        expect(session.retire).toBeCalledTimes(0);

        // Once the session becomes unusable, marking it (good or bad) retires it.
        session.isUsable = () => false;
        session.markGood();
        expect(session.retire).toBeCalledTimes(1);
        session.markBad();
        expect(session.retire).toBeCalledTimes(2);
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

        entries(state).forEach(([key, value]) => {
            if (session[key] instanceof Date) {
                expect((session[key] as Date).toISOString()).toEqual(value);
            } else if (key === 'cookieJar') {
                expect(value).toEqual(session[key].toJSON());
            } else {
                expect(session[key]).toEqual(value);
            }
        });
    });

    test('should use cookieJar', () => {
        session = new Session();
        expect(session.cookieJar.setCookie).toBeDefined();
    });

    test('setCookie does not throw on malformed raw cookie string', () => {
        session = new Session();
        expect(() => session.setCookie('garbled!!!@#$%nonsense', 'https://www.example.com')).not.toThrow();
    });

    test('retired state survives a getState() / new Session() round-trip', () => {
        session.retire();

        const old = session.getState();
        expect(old.retired).toBe(true);

        // @ts-expect-error Overriding string -> Date
        old.createdAt = new Date(old.createdAt);
        // @ts-expect-error Overriding string -> Date
        old.expiresAt = new Date(old.expiresAt);

        // @ts-expect-error string -> Date for createdAt has been overridden
        const reinitialized = new Session({ ...old });
        expect(reinitialized.retired).toBe(true);
        expect(reinitialized.isUsable()).toBe(false);

        reinitialized.markGood();
        expect(reinitialized.isUsable()).toBe(false);
    });

    test('should correctly persist and init cookieJar', () => {
        const newSession = new Session();
        const url = 'https://example.com';
        newSession.cookieJar.setCookieSync('CSRF=e8b667; Domain=example.com; Secure', url);
        newSession.cookieJar.setCookieSync('id=a3fWa; Expires=Wed, 21 Oct 2099 07:28:00 GMT; Domain=example.com', url);

        const old = newSession.getState();

        // @ts-expect-error Overriding string -> Date
        old.createdAt = new Date(old.createdAt);
        // @ts-expect-error Overriding string -> Date
        old.expiresAt = new Date(old.expiresAt);

        // @ts-expect-error string -> Date for createdAt has been overridden
        const reinitializedSession = new Session({ ...old });
        expect(reinitializedSession.getCookieString(url)).toEqual('CSRF=e8b667; id=a3fWa');
    });
});
