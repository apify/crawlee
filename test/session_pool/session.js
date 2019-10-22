import { expect } from 'chai';

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

    it('should markGood session and lower the errorScore', () => {
        expect(session.usageCount).to.be.eql(0);
        expect(session.errorScore).to.be.eql(0);
        session.markGood();
        expect(session.usageCount).to.be.eql(1);
        expect(session.errorScore).to.be.eql(0);
        session.errorScore = 1;
        session.markGood();
        expect(session.errorScore).to.be.eql(0.5);
    });

    it('should throw error when param sessionPool is not EventEmitter instance', () => {
        let err;
        try {
            const session = new Session({ sessionPool: {} }); // eslint-disable-line
        } catch (e) {
            err = e;
        }
        expect(err).to.exist; // eslint-disable-line
        expect(err.message.includes('Session: sessionPool must be instance of SessionPool')).to.be.true; // eslint-disable-line
    });

    it('should mark session markBaded', () => {
        session.markBad();
        expect(session.errorScore).to.be.eql(1);
        expect(session.usageCount).to.be.eql(1);
    });

    it('should expire session', async () => {
        session = new Session({ maxAgeSecs: 1 / 100, sessionPool });
        await Apify.utils.sleep(101);
        expect(session.isExpired()).to.be.eql(true);
        expect(session.isUsable()).to.be.eql(false);
    });

    it('should max out session usage', () => {
        session.maxSessionUsageCount = 1;
        session.markGood();
        expect(session.isMaxUsageCountReached()).to.be.eql(true);
        expect(session.isUsable()).to.be.eql(false);
    });

    it('should block session', () => {
        session.errorScore += session.maxErrorScore;
        expect(session.isBlocked()).to.be.eql(true);
        expect(session.isUsable()).to.be.eql(false);
    });

    it('should markGood session', () => {
        session.markGood();
        expect(session.usageCount).to.be.eql(1);
        expect(session.isUsable()).to.be.eql(true);
    });

    it('should retire session', () => {
        let discarded = false;
        sessionPool.on(EVENTS.SESSION_RETIRED, (ses) => {
            expect(ses instanceof Session).to.be.eql(true);
            discarded = true;
        });
        session.retire();
        expect(discarded).to.be.true; // eslint-disable-line
        expect(session.usageCount).to.be.eql(1);
    });

    it('should get state', () => {
        const state = session.getState();

        expect(state.id).to.exist; // eslint-disable-line
        expect(state.cookies).to.exist;  // eslint-disable-line
        expect(state.userData).to.exist;  // eslint-disable-line
        expect(state.maxErrorScore).to.exist;  // eslint-disable-line
        expect(state.errorScoreDecrement).to.exist;  // eslint-disable-line
        expect(state.expiresAt).to.exist;  // eslint-disable-line
        expect(state.createdAt).to.exist;  // eslint-disable-line
        expect(state.usageCount).to.exist;  // eslint-disable-line
        expect(state.errorScore).to.exist;  // eslint-disable-line


        Object.entries(state).forEach(([key, value]) => {
            if (session[key] instanceof Date) {
                expect(session[key].toISOString()).to.be.eql(value);
            } else {
                expect(session[key]).to.be.eql(value);
            }
        });
    });
});
