import { type CrawleeLogger } from '@crawlee/core';
import type { Cookie, Dictionary } from '@crawlee/types';
import { TypedEmitter } from 'tiny-typed-emitter';
import { BROWSER_CONTROLLER_EVENTS } from '../events.js';
import type { LaunchContext } from '../launch-context.js';
import type { UnwrapPromise } from '../utils.js';
import type { BrowserPlugin, CommonBrowser, CommonLibrary } from './browser-plugin.js';
/**
 * The subset of the browser-pool `LaunchContext` that {@apilink IBrowserController} exposes.
 * Other fields are only available on the concrete `LaunchContext` class.
 */
export interface IBrowserLaunchContext {
    /**
     * The proxy URL the browser was launched with, if any.
     */
    proxyUrl?: string;
    /**
     * The fingerprint applied to the browser, if fingerprinting is enabled.
     * Typed as `unknown` here; cast to the concrete `LaunchContext` if you
     * need the structured shape.
     */
    fingerprint?: unknown;
    /**
     * `true` if each page in this browser uses its own context.
     */
    useIncognitoPages?: boolean;
    /**
     * The actual options the browser was launched with, after pre-launch hooks.
     */
    launchOptions?: Dictionary | undefined;
}
/**
 * The minimal public contract of a browser controller.
 *
 * Coordination with the pool (page-counting, `activate`, `assignBrowser`, lifecycle
 * promises, …) is intentionally **not** part of this contract.
 *
 * @category Browser management
 */
export interface IBrowserController<Page = unknown> {
    /**
     * A stable identifier for this controller instance. Useful for tracking
     * which browser served which request.
     */
    readonly id: string;
    /**
     * The configuration the underlying browser was launched with — proxy URL,
     * fingerprint, session, launcher-specific options, etc.
     */
    readonly launchContext: IBrowserLaunchContext;
    /**
     * The raw browser handle from the underlying automation library
     * (Puppeteer `Browser`, Playwright `Browser`/`BrowserContext`, …).
     * Escape hatch for things the controller does not expose directly.
     */
    readonly browser: unknown;
    /**
     * Reads cookies for the given page.
     */
    getCookies(page: Page): Promise<Cookie[]>;
    /**
     * Writes cookies for the given page.
     */
    setCookies(page: Page, cookies: Cookie[]): Promise<void>;
    /**
     * Gracefully closes the browser this controller owns. After this resolves,
     * the controller is no longer usable.
     */
    close(): Promise<void>;
}
export interface BrowserControllerEvents<Library extends CommonLibrary, LibraryOptions extends Dictionary | undefined = Parameters<Library['launch']>[0], LaunchResult extends CommonBrowser = UnwrapPromise<ReturnType<Library['launch']>>, NewPageOptions = Parameters<LaunchResult['newPage']>[0], NewPageResult = UnwrapPromise<ReturnType<LaunchResult['newPage']>>> {
    [BROWSER_CONTROLLER_EVENTS.BROWSER_CLOSED]: (controller: BrowserController<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>) => void;
}
/**
 * The `BrowserController` serves two purposes. First, it is the base class that
 * specialized controllers like `PuppeteerController` or `PlaywrightController`
 * extend. Second, it defines the public interface of the specialized classes
 * which provide only private methods. Therefore, we do not keep documentation
 * for the specialized classes, because it's the same for all of them.
 * @hideconstructor
 */
export declare abstract class BrowserController<Library extends CommonLibrary = CommonLibrary, LibraryOptions extends Dictionary | undefined = Parameters<Library['launch']>[0], LaunchResult extends CommonBrowser = UnwrapPromise<ReturnType<Library['launch']>>, NewPageOptions = Parameters<LaunchResult['newPage']>[0], NewPageResult = UnwrapPromise<ReturnType<LaunchResult['newPage']>>> extends TypedEmitter<BrowserControllerEvents<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>> implements IBrowserController<NewPageResult> {
    #private;
    readonly id: string;
    protected readonly log: CrawleeLogger;
    /**
     * The `BrowserPlugin` instance used to launch the browser.
     */
    readonly browserPlugin: BrowserPlugin<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>;
    /**
     * Browser representation of the underlying automation library.
     */
    browser: LaunchResult;
    /**
     * The configuration the browser was launched with.
     */
    launchContext: LaunchContext<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>;
    /**
     * The proxy URL used by the browser controller.
     * `undefined` if no proxy is used
     */
    proxyUrl?: string;
    isActive: boolean;
    activePages: number;
    totalPages: number;
    lastPageOpenedAt: number;
    get isActivePromise(): Promise<void>;
    constructor(browserPlugin: BrowserPlugin<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>);
    /**
     * Activates the BrowserController. If you try to open new pages before
     * activation, the pages will get queued and will only be opened after
     * activate is called.
     * @ignore
     */
    activate(): void;
    /**
     * @ignore
     */
    assignBrowser(browser: LaunchResult, launchContext: LaunchContext<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>): void;
    /**
     * Gracefully closes the browser and makes sure
     * there will be no lingering browser processes.
     *
     * Emits 'browserClosed' event.
     */
    close(): Promise<void>;
    /**
     * Immediately kills the browser process.
     *
     * Emits 'browserClosed' event.
     */
    kill(): Promise<void>;
    /**
     * Opens new browser page.
     * @ignore
     */
    newPage(pageOptions?: NewPageOptions): Promise<NewPageResult>;
    setCookies(page: NewPageResult, cookies: Cookie[]): Promise<void>;
    getCookies(page: NewPageResult): Promise<Cookie[]>;
    /**
     * @private
     */
    protected abstract _close(): Promise<void>;
    /**
     * @private
     */
    protected abstract _kill(): Promise<void>;
    /**
     * @private
     */
    protected abstract _newPage(pageOptions?: NewPageOptions): Promise<NewPageResult>;
    /**
     * @private
     */
    protected abstract _setCookies(page: NewPageResult, cookies: Cookie[]): Promise<void>;
    /**
     * @private
     */
    protected abstract _getCookies(page: NewPageResult): Promise<Cookie[]>;
    /**
     * @private
     */
    abstract normalizeProxyOptions(proxyUrl: string | undefined, pageOptions: any): Record<string, unknown>;
}
