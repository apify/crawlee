"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractUrls = exports.downloadListOfUrls = void 0;
const tslib_1 = require("tslib");
const ow_1 = tslib_1.__importDefault(require("ow"));
const got_scraping_1 = require("got-scraping");
const general_1 = require("./general");
/**
 * Returns a promise that resolves to an array of urls parsed from the resource available at the provided url.
 * Optionally, custom regular expression and encoding may be provided.
 */
async function downloadListOfUrls(options) {
    (0, ow_1.default)(options, ow_1.default.object.exactShape({
        url: ow_1.default.string.url,
        encoding: ow_1.default.optional.string,
        urlRegExp: ow_1.default.optional.regExp,
        proxyUrl: ow_1.default.optional.string,
    }));
    const { url, encoding = 'utf8', urlRegExp = general_1.URL_NO_COMMAS_REGEX, proxyUrl } = options;
    // Try to detect wrong urls and fix them. Currently, detects only sharing url instead of csv download one.
    const match = url.match(/^(https:\/\/docs\.google\.com\/spreadsheets\/d\/(?:\w|-)+)\/?/);
    let fixedUrl = url;
    if (match) {
        fixedUrl = `${match[1]}/gviz/tq?tqx=out:csv`;
    }
    const { body: string } = await (0, got_scraping_1.gotScraping)({ url: fixedUrl, encoding, proxyUrl });
    return extractUrls({ string, urlRegExp });
}
exports.downloadListOfUrls = downloadListOfUrls;
/**
 * Collects all URLs in an arbitrary string to an array, optionally using a custom regular expression.
 */
function extractUrls(options) {
    (0, ow_1.default)(options, ow_1.default.object.exactShape({
        string: ow_1.default.string,
        urlRegExp: ow_1.default.optional.regExp,
    }));
    const { string, urlRegExp = general_1.URL_NO_COMMAS_REGEX } = options;
    return string.match(urlRegExp) || [];
}
exports.extractUrls = extractUrls;
//# sourceMappingURL=extract-urls.js.map