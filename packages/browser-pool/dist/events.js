"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BROWSER_CONTROLLER_EVENTS = exports.BROWSER_POOL_EVENTS = void 0;
var BROWSER_POOL_EVENTS;
(function (BROWSER_POOL_EVENTS) {
    BROWSER_POOL_EVENTS["BROWSER_LAUNCHED"] = "browserLaunched";
    BROWSER_POOL_EVENTS["BROWSER_RETIRED"] = "browserRetired";
    BROWSER_POOL_EVENTS["BROWSER_CLOSED"] = "browserClosed";
    BROWSER_POOL_EVENTS["PAGE_CREATED"] = "pageCreated";
    BROWSER_POOL_EVENTS["PAGE_CLOSED"] = "pageClosed";
})(BROWSER_POOL_EVENTS = exports.BROWSER_POOL_EVENTS || (exports.BROWSER_POOL_EVENTS = {}));
var BROWSER_CONTROLLER_EVENTS;
(function (BROWSER_CONTROLLER_EVENTS) {
    BROWSER_CONTROLLER_EVENTS["BROWSER_CLOSED"] = "browserClosed";
})(BROWSER_CONTROLLER_EVENTS = exports.BROWSER_CONTROLLER_EVENTS || (exports.BROWSER_CONTROLLER_EVENTS = {}));
//# sourceMappingURL=events.js.map