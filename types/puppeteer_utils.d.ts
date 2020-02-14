export function gotoExtended(page: Page, request: Request, gotoOptions?: any): Promise<Response>;
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
    export function enqueueLinks(...args: any[]): Promise<import("./request_queue").QueueOperationInfo[]>;
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
import { Page } from "puppeteer";
import Request from "./request";
import { Response } from "puppeteer";
declare function hideWebDriver(page: Page): Promise<any>;
declare function injectFile(page: Page, filePath: string, options?: {
    surviveNavigations?: boolean;
}): Promise<any>;
declare function injectJQuery(page: Page): Promise<any>;
declare function injectUnderscore(page: Page): Promise<any>;
declare function enqueueRequestsFromClickableElements(page: any, selector: any, purls: any, requestQueue: any, requestOpts?: {}): Promise<any[]>;
import { enqueueLinksByClickingElements } from "./enqueue_links/click_elements";
declare function blockRequests(page: Page, options?: {
    urlPatterns?: string[];
    extraUrlPatterns?: string[];
}): Promise<any>;
declare function blockResources(page: any, resourceTypes?: string[]): Promise<void>;
declare function cacheResponses(page: Page, cache: any, responseUrlRules: (string | RegExp)[]): Promise<any>;
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
