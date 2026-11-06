import { Session } from '@crawlee/basic';
import { sleep } from '@crawlee/utils';

import { entries } from '../../shared/typedefs.js';

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
        session.markBad();
        expect(session.errorScore).toBe(1);
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
        session = new Session({ maxUsageCount: 1 });
        session.markGood();
        expect(session.isMaxUsageCountReached()).toBe(true);
        expect(session.isUsable()).toBe(false);
    });

    test('should block session', () => {
        session = new Session({ maxErrorScore: 3, errorScore: 3 });
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

    test('running out of uses is terminal but not a block', () => {
        session = new Session({ maxUsageCount: 1 });
        session.markGood();

        expect(session.isUsable()).toBe(false);
        expect(session.isBlocked()).toBe(false);
        expect(session.getState().retired).toBe(true);
    });

    test('marking bad up to maxErrorScore blocks the session', () => {
        session = new Session({ maxErrorScore: 2 });
        session.markBad();
        expect(session.isBlocked()).toBe(false);
        session.markBad();

        expect(session.isBlocked()).toBe(true);
        expect(session.getState().retired).toBe(true);
    });

    test('retire() blocks a session that already ran out of uses', () => {
        session = new Session({ maxUsageCount: 1 });
        session.markBad();
        session.retire();

        expect(session.isBlocked()).toBe(true);
    });

    test('markGood() does not unblock a blocked session', () => {
        session = new Session({ maxErrorScore: 2 });
        session.markBad();
        session.markBad();
        session.markGood();

        expect(session.isBlocked()).toBe(true);
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

    test('setCookie does not throw on malformed raw cookie string', async () => {
        session = new Session();
        await expect(session.setCookie('garbled!!!@#$%nonsense', 'https://www.example.com')).resolves.not.toThrow();
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

    test('should correctly persist and init cookieJar', async () => {
        const newSession = new Session();
        const url = 'https://example.com';
        await newSession.cookieJar.setCookie('CSRF=e8b667; Domain=example.com; Secure', url);
        await newSession.cookieJar.setCookie(
            'id=a3fWa; Expires=Wed, 21 Oct 2099 07:28:00 GMT; Domain=example.com',
            url,
        );

        const old = newSession.getState();

        // @ts-expect-error Overriding string -> Date
        old.createdAt = new Date(old.createdAt);
        // @ts-expect-error Overriding string -> Date
        old.expiresAt = new Date(old.expiresAt);

        // @ts-expect-error string -> Date for createdAt has been overridden
        const reinitializedSession = new Session({ ...old });
        await expect(reinitializedSession.getCookieString(url)).resolves.toEqual('CSRF=e8b667; id=a3fWa');
    });
});
