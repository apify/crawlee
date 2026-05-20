import { Session, SessionPool } from '@crawlee/core';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { startGhostActor } from '../shared/ghost_actor';

describe('SessionPool eviction on pool exhaustion', () => {
    let sessionPool: SessionPool;

    beforeEach(async () => {
        sessionPool = await SessionPool.open({ maxPoolSize: 2 });
    });

    afterEach(async () => {
        await sessionPool.teardown();
    });

    test('getSession creates a new session when all retired and pool is at capacity', async () => {
        // Fill the pool with 2 usable sessions
        const session1 = await sessionPool.getSession();
        const session2 = await sessionPool.getSession();

        // Retire both sessions by pushing error score to max
        // @ts-expect-error Overriding private property
        session1._errorScore = session1.maxErrorScore;
        session1.retire();

        // @ts-expect-error Overriding private property
        session2._errorScore = session2.maxErrorScore;
        session2.retire();

        expect(sessionPool.retiredSessionsCount).toBe(2);
        expect(sessionPool.getState().usableSessionsCount).toBe(0);

        // The pool is at maxCapacity (2 retired sessions, 0 usable)
        // Next getSession should evict all retired sessions and create a new one
        const newSession = await sessionPool.getSession();

        // Should get a brand new session, not a retired one
        expect(newSession.id).not.toBe(session1.id);
        expect(newSession.id).not.toBe(session2.id);

        // All retired sessions should be evicted from the pool
        expect(sessionPool.retiredSessionsCount).toBe(0);
        expect(sessionPool.getState().usableSessionsCount).toBe(1);
    });

    test('all retired sessions are evicted together when pool is exhausted', async () => {
        // Fill pool
        const sessions: Session[] = [];
        for (let i = 0; i < 2; i++) {
            sessions.push(await sessionPool.getSession());
        }

        // Retire all sessions
        for (const session of sessions) {
            // @ts-expect-error Overriding private property
            session._errorScore = session.maxErrorScore;
            session.retire();
        }

        expect(sessionPool.retiredSessionsCount).toBe(2);

        // Getting multiple sessions should each trigger eviction of all retired sessions
        // and create a new session
        const newSessions: Session[] = [];
        for (let i = 0; i < 2; i++) {
            newSessions.push(await sessionPool.getSession());
        }

        // All retired sessions should be gone
        expect(sessionPool.retiredSessionsCount).toBe(0);
        expect(newSessions[0].id).not.toBe(sessions[0].id);
        expect(newSessions[1].id).not.toBe(sessions[1].id);
    });
});
