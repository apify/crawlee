import type { Cookie, Dictionary } from '@crawlee/types';
import { nanoid } from 'nanoid';
import { TypedEmitter } from 'tiny-typed-emitter';

import { tryCancel } from '@apify/timeout';

import { BROWSER_CONTROLLER_EVENTS } from '../events';
import type { LaunchContext } from '../launch-context';
import { log } from '../logger';
import type { UnwrapPromise } from '../utils';
import type { BrowserPlugin, CommonBrowser, CommonLibrary } from './browser-plugin';

const PROCESS_KILL_TIMEOUT_MILLIS = 5000;

export interface BrowserControllerEvents<
    Library extends CommonLibrary,
    LibraryOptions extends Dictionary | undefined = Parameters<Library['launch']>[0],
    LaunchResult extends CommonBrowser = UnwrapPromise<ReturnType<Library['launch']>>,
    NewPageOptions = Parameters<LaunchResult['newPage']>[0],
    NewPageResult = UnwrapPromise<ReturnType<LaunchResult['newPage']>>,
> {
    [BROWSER_CONTROLLER_EVENTS.BROWSER_CLOSED]: (
        controller: BrowserController<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>,
    ) => void;
}

/**
 * The `BrowserController` serves two purposes. First, it is the base class that
 * specialized controllers like `PuppeteerController` or `PlaywrightController`
 * extend. Second, it defines the public interface of the specialized classes
 * which provide only private methods. Therefore, we do not keep documentation
 * for the specialized classes, because it's the same for all of them.
 * @hideconstructor
 */
export abstract class BrowserController<
    Library extends CommonLibrary = CommonLibrary,
    LibraryOptions extends Dictionary | undefined = Parameters<Library['launch']>[0],
    LaunchResult extends CommonBrowser = UnwrapPromise<ReturnType<Library['launch']>>,
    NewPageOptions = Parameters<LaunchResult['newPage']>[0],
    NewPageResult = UnwrapPromise<ReturnType<LaunchResult['newPage']>>,
> extends TypedEmitter<BrowserControllerEvents<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>> {
    id = nanoid();

    /**
     * The `BrowserPlugin` instance used to launch the browser.
     */
    browserPlugin: BrowserPlugin<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>;

    /**
     * Browser representation of the underlying automation library.
     */
    browser: LaunchResult = undefined!;

    /**
     * The configuration the browser was launched with.
     */
    launchContext: LaunchContext<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult> = undefined!;

    /**
     * The proxy tier tied to this browser controller.
     * `undefined` if no tiered proxy is used.
     */
    proxyTier?: number;

    /**
     * The proxy URL used by the browser controller. This is set every time the browser controller uses proxy (even the tiered one).
     * `undefined` if no proxy is used
     */
    proxyUrl?: string;

    isActive = false;

    activePages = 0;

    totalPages = 0;

    lastPageOpenedAt = Date.now();

    private _activate!: () => void;

    private isActivePromise = new Promise<void>((resolve) => {
        this._activate = resolve;
    });

    private commitBrowser!: () => void;

    private hasBrowserPromise = new Promise<void>((resolve) => {
        this.commitBrowser = resolve;
    });

    constructor(browserPlugin: BrowserPlugin<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>) {
        super();
        this.browserPlugin = browserPlugin;
    }

    /**
     * Activates the BrowserController. If you try to open new pages before
     * activation, the pages will get queued and will only be opened after
     * activate is called.
     * @ignore
     */
    activate(): void {
        if (!this.browser) {
            throw new Error('Cannot activate BrowserController without an assigned browser.');
        }
        this._activate();
        this.isActive = true;
    }

    /**
     * @ignore
     */
    assignBrowser(
        browser: LaunchResult,
        launchContext: LaunchContext<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>,
    ): void {
        if (this.browser) {
            throw new Error('BrowserController already has a browser instance assigned.');
        }
        this.browser = browser;
        this.launchContext = launchContext;
        this.commitBrowser();
    }

    /**
     * Gracefully closes the browser and makes sure
     * there will be no lingering browser processes.
     *
     * Emits 'browserClosed' event.
     */
    async close(): Promise<void> {
        await this.hasBrowserPromise;

        try {
            await this._close();
            // TODO: shouldn't this go in a finally instead?
            this.isActive = false;
        } catch (error) {
            log.debug(`Could not close browser.\nCause: ${(error as Error).message}`, { id: this.id });
        }

        this.emit(BROWSER_CONTROLLER_EVENTS.BROWSER_CLOSED, this);

        setTimeout(() => {
            this._kill().catch((err) => {
                log.debug(`Could not kill browser.\nCause: ${err.message}`, { id: this.id });
            });
        }, PROCESS_KILL_TIMEOUT_MILLIS);
    }

    /**
     * Immediately kills the browser process.
     *
     * Emits 'browserClosed' event.
     */
    async kill(): Promise<void> {
        await this.hasBrowserPromise;
        await this._kill();
        this.emit(BROWSER_CONTROLLER_EVENTS.BROWSER_CLOSED, this);
    }

    /**
     * Opens new browser page.
     * @ignore
     */
    async newPage(pageOptions?: NewPageOptions): Promise<NewPageResult> {
        this.activePages++;
        this.totalPages++;
        await this.isActivePromise;
        const page = await this._newPage(pageOptions);
        tryCancel();
        this.lastPageOpenedAt = Date.now();

        return page;
    }

    async setCookies(page: NewPageResult, cookies: Cookie[]): Promise<void> {
        return this._setCookies(page, cookies);
    }

    async getCookies(page: NewPageResult): Promise<Cookie[]> {
        return this._getCookies(page);
    }

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
