import { EventEmitter } from 'node:events';

import type { Browser, BrowserContext, BrowserType } from 'playwright';

export interface BrowserOptions {
    browserContext: BrowserContext;
    version: string;
    /** When wrapping a remote CDP browser's default context, pass the real Browser so it can be closed properly. */
    parentBrowser?: Browser;
}

/**
 * Browser wrapper created to have consistent API with persistent and non-persistent contexts.
 */
export class PlaywrightBrowser extends EventEmitter {
    private _browserContext: BrowserContext;
    private _version: string;
    private _isConnected = true;
    private _browserType?: BrowserType;
    private _parentBrowser?: Browser;

    constructor(options: BrowserOptions) {
        super();

        const { browserContext, version, parentBrowser } = options;
        this._browserContext = browserContext;
        this._version = version;
        this._parentBrowser = parentBrowser;

        this._browserContext.once('close', () => {
            this._isConnected = false;
            this.emit('disconnected');
        });

        // Forward real browser disconnection so the pool detects remote crashes.
        if (parentBrowser) {
            parentBrowser.once('disconnected', () => {
                this._isConnected = false;
                this.emit('disconnected');
            });
        }
    }

    async [Symbol.asyncDispose](): Promise<void> {
        await this.close();
    }

    async close(): Promise<void> {
        await this._browserContext.close();
        if (this._parentBrowser) {
            await this._parentBrowser.close().catch(() => {});
        }
    }

    contexts(): BrowserContext[] {
        return [this._browserContext];
    }

    isConnected(): boolean {
        return this._isConnected;
    }

    version(): string {
        return this._version;
    }

    /** @internal */
    _setBrowserType(browserType: BrowserType): void {
        this._browserType = browserType;
    }

    browserType(): BrowserType {
        return this._browserType!;
    }

    async newPage(...args: Parameters<BrowserContext['newPage']>): ReturnType<BrowserContext['newPage']> {
        return this._browserContext.newPage(...args);
    }

    async newContext(): Promise<never> {
        throw new Error('Function `newContext()` is not available in incognito mode');
    }

    async newBrowserCDPSession(): Promise<never> {
        throw new Error('Function `newBrowserCDPSession()` is not available in incognito mode');
    }

    async startTracing(): Promise<never> {
        throw new Error('Function `startTracing()` is not available in incognito mode');
    }

    async stopTracing(): Promise<never> {
        throw new Error('Function `stopTracing()` is not available in incognito mode');
    }
}
