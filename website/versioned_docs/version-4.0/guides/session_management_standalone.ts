import { SessionPool } from 'crawlee';

// Override the default Session pool configuration.
const sessionPoolOptions = {
    maxPoolSize: 100,
};

const sessionPool = new SessionPool(sessionPoolOptions);

// Get session.
const session = await sessionPool.getSession();

// Increase the errorScore.
session.markBad();

// Throw away the session.
session.retire();

// Lower the errorScore and mark the session good.
session.markGood();
