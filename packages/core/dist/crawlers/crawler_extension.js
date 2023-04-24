"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrawlerExtension = void 0;
const log_1 = require("../log");
/**
 * Abstract class with pre-defined method to connect to the Crawlers class by the "use" crawler method.
 * @category Crawlers
 * @ignore
 */
class CrawlerExtension {
    constructor() {
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: this.constructor.name
        });
        Object.defineProperty(this, "log", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: log_1.log.child({ prefix: this.name })
        });
    }
    getCrawlerOptions() {
        throw new Error(`${this.name} has not implemented "getCrawlerOptions" method.`);
    }
}
exports.CrawlerExtension = CrawlerExtension;
//# sourceMappingURL=crawler_extension.js.map