"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
// Override the default Session pool configuration.
const sessionPoolOptions = {
    maxPoolSize: 100,
};
// Open Session Pool.
const sessionPool = await crawlee_1.SessionPool.open(sessionPoolOptions);
// Get session.
const session = await sessionPool.getSession();
// Increase the errorScore.
session.markBad();
// Throw away the session.
session.retire();
// Lower the errorScore and mark the session good.
session.markGood();
