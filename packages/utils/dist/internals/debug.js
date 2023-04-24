"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRequestDebugInfo = void 0;
const tslib_1 = require("tslib");
const ow_1 = tslib_1.__importDefault(require("ow"));
/**
 * Creates a standardized debug info from request and response. This info is usually added to dataset under the hidden `#debug` field.
 *
 * @param request [Request](https://sdk.apify.com/docs/api/request) object.
 * @param [response]
 *   Puppeteer [`Response`](https://pptr.dev/#?product=Puppeteer&version=v1.11.0&show=api-class-response)
 *   or NodeJS [`http.IncomingMessage`](https://nodejs.org/api/http.html#http_class_http_serverresponse).
 * @param [additionalFields] Object containing additional fields to be added.
 */
function createRequestDebugInfo(request, response = {}, additionalFields = {}) {
    (0, ow_1.default)(request, ow_1.default.object);
    (0, ow_1.default)(response, ow_1.default.object);
    (0, ow_1.default)(additionalFields, ow_1.default.object);
    return {
        requestId: request.id,
        url: request.url,
        loadedUrl: request.loadedUrl,
        method: request.method,
        retryCount: request.retryCount,
        errorMessages: request.errorMessages,
        // Puppeteer response has .status() function and NodeJS response, statusCode property.
        statusCode: 'status' in response && response.status instanceof Function ? response.status() : response.statusCode,
        ...additionalFields,
    };
}
exports.createRequestDebugInfo = createRequestDebugInfo;
//# sourceMappingURL=debug.js.map