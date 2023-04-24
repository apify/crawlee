import { TypedEmitter } from 'tiny-typed-emitter';
import type { Cookie, Dictionary } from '@crawlee/types';
import { BROWSER_CONTROLLER_EVENTS } from '../events';
import type { LaunchContext } from '../launch-context';
import type { UnwrapPromise } from '../utils';
import type { BrowserPlugin, CommonBrowser, CommonLibrary } from './browser-plugin';
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
export declare abstract class BrowserController<Library extends CommonLibrary = CommonLibrary, LibraryOptions extends Dictionary | undefined = Parameters<Library['launch']>[0], LaunchResult extends CommonBrowser = UnwrapPromise<ReturnType<Library['launch']>>, NewPageOptions = Parameters<LaunchResult['newPage']>[0], NewPageResult = UnwrapPromise<ReturnType<LaunchResult['newPage']>>> extends TypedEmitter<BrowserControllerEvents<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>> {
    id: string;
    /**
     * The `BrowserPlugin` instance used to launch the browser.
     */
    browserPlugin: BrowserPlugin<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>;
    /**
     * Browser representation of the underlying automation library.
     */
    browser: LaunchResult;
    /**
     * The configuration the browser was launched with.
     */
    launchContext: LaunchContext<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>;
    isActive: boolean;
    activePages: number;
    totalPages: number;
    lastPageOpenedAt: number;
    private _activate;
    private isActivePromise;
    private commitBrowser;
    private hasBrowserPromise;
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
//# sourceMappingURL=browser-controller.d.ts.map