"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
const proxyConfiguration = new crawlee_1.ProxyConfiguration({ /* opts */});
const sessionPool = await crawlee_1.SessionPool.open({ /* opts */});
const session = await sessionPool.getSession();
const proxyUrl = await proxyConfiguration.newUrl(session.id);
