import { SessionPool } from 'crawlee';

// Override the default Session pool configuration.
const sessionPoolOptions = {
    maxPoolSize: 100,
};

// Open Session Pool.
const sessionPool = await SessionPool.open(sessionPoolOptions);

// Get session.
const session = await sessionPool.getSession();

if (session) {
    // Increase the errorScore.
    session.markBad();

    // Throw away the session.
    session.retire();

    // Lower the errorScore and mark the session good.
    session.markGood();

    // Return the session to the pool, so it can be reused
    sessionPool.reclaimSession(session);
}


