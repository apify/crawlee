export function gotoExtended(page: any, request: Request, gotoOptions?: any): Promise<Response>;
export function infiniteScroll(page: any, options?: {
    timeoutSecs?: number;
    waitForSecs?: number;
}): Promise<any>;
export namespace puppeteerUtils {
    export { hideWebDriver };
    export { injectFile };
    export { injectJQuery };
    export { injectUnderscore };
    export { enqueueRequestsFromClickableElements };
    export function enqueueLinks(...args: any[]): Promise<any[]>;
    export { enqueueLinksByClickingElements };
    export { blockRequests };
    export { blockResources };
    export { cacheResponses };
    export { compileScript };
    export { gotoExtended };
    export { addInterceptRequestHandler };
    export { removeInterceptRequestHandler };
    export { infiniteScroll };
    export { saveSnapshot };
}
import Request from "./request";
declare function hideWebDriver(page: any): Promise<any>;
declare function injectFile(page: any, filePath: string, options?: {
    surviveNavigations?: boolean;
}): Promise<any>;
declare function injectJQuery(page: any): Promise<any>;
declare function injectUnderscore(page: any): Promise<any>;
declare function enqueueRequestsFromClickableElements(page: any, selector: any, purls: any, requestQueue: any, requestOpts?: {}): Promise<any[]>;
import { enqueueLinksByClickingElements } from "./enqueue_links/click_elements";
declare function blockRequests(page: any, options?: {
    urlPatterns?: string[];
    extraUrlPatterns?: boolean;
}): Promise<any>;
declare function blockResources(page: any, resourceTypes?: string[]): Promise<void>;
declare function cacheResponses(page: any, cache: any, responseUrlRules: (string | RegExp)[]): Promise<any>;
declare function compileScript(scriptString: string, context?: any): Function;
import { addInterceptRequestHandler } from "./puppeteer_request_interception";
import { removeInterceptRequestHandler } from "./puppeteer_request_interception";
declare function saveSnapshot(page: any, options?: {
    key?: string;
    screenshotQuality?: number;
    saveScreenshot?: boolean;
    saveHtml?: boolean;
    keyValueStoreName?: string;
}): Promise<any>;
export {};
