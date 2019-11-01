import { Session } from '../../build/session_pool/session';
import { SessionPool } from '../../build/session_pool/session_pool';
import EVENTS from '../../build/session_pool/events';

import Apify from '../../build';


describe('Session - testing session behaviour ', async () => {
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
        }
    );

    test('should mark session markBaded', () => {
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
        session.maxSessionUsageCount = 1;
        session.markGood();
        expect(session.isMaxUsageCountReached()).toBe(true);
        expect(session.isUsable()).toBe(false);
    });

    test('should block session', () => {
        session.errorScore += session.maxErrorScore;
        expect(session.isBlocked()).toBe(true);
        expect(session.isUsable()).toBe(false);
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

        expect(state.id).toBeDefined(); // eslint-disable-line
        expect(state.cookies).toBeDefined();  // eslint-disable-line
        expect(state.userData).toBeDefined();  // eslint-disable-line
        expect(state.maxErrorScore).toBeDefined();  // eslint-disable-line
        expect(state.errorScoreDecrement).toBeDefined();  // eslint-disable-line
        expect(state.expiresAt).toBeDefined();  // eslint-disable-line
        expect(state.createdAt).toBeDefined();  // eslint-disable-line
        expect(state.usageCount).toBeDefined();  // eslint-disable-line
        expect(state.errorScore).toBeDefined();  // eslint-disable-line


        Object.entries(state).forEach(([key, value]) => {
            if (session[key] instanceof Date) {
                expect(session[key].toISOString()).toEqual(value);
            } else {
                expect(session[key]).toEqual(value);
            }
        });
    });
});
