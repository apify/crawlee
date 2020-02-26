export function gotoExtended(page: Page, request: Request, gotoOptions?: DirectNavigationOptions): Promise<Response | null>;
export function infiniteScroll(page: Page, options?: {
    timeoutSecs?: number;
    waitForSecs?: number;
} | undefined): Promise<void>;
export namespace puppeteerUtils {
    export { hideWebDriver };
    export { injectFile };
    export { injectJQuery };
    export { injectUnderscore };
    export { enqueueRequestsFromClickableElements };
    export function enqueueLinks(...args: any[]): Promise<import("./request_queue").QueueOperationInfo[] | undefined>;
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
import { DirectNavigationOptions } from "puppeteer";
import { Response } from "puppeteer";
declare function hideWebDriver(page: Page): Promise<void>;
declare function injectFile(page: Page, filePath: string, options?: {
    surviveNavigations?: boolean;
} | undefined): Promise<any>;
declare function injectJQuery(page: Page): Promise<any>;
declare function injectUnderscore(page: Page): Promise<any>;
declare function enqueueRequestsFromClickableElements(page: any, selector: any, purls: any, requestQueue: any, requestOpts?: {}): Promise<any[]>;
import { enqueueLinksByClickingElements } from "./enqueue_links/click_elements";
declare function blockRequests(page: Page, options?: {
    urlPatterns?: string[];
    extraUrlPatterns?: string[];
} | undefined): Promise<void>;
declare function blockResources(page: any, resourceTypes?: string[]): Promise<void>;
declare function cacheResponses(page: Page, cache: Object, responseUrlRules: (string | RegExp)[]): Promise<void>;
declare function compileScript(scriptString: string, context?: Object): Function;
import { addInterceptRequestHandler } from "./puppeteer_request_interception";
import { removeInterceptRequestHandler } from "./puppeteer_request_interception";
declare function saveSnapshot(page: Page, options?: {
    key?: string;
    screenshotQuality?: number;
    saveScreenshot?: boolean;
    saveHtml?: boolean;
    keyValueStoreName?: string;
} | undefined): Promise<void>;
export {};
