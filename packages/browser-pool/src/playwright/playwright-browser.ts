import { EventEmitter } from 'node:events';
import type { BrowserContext, BrowserType, Browser } from 'playwright';

export interface BrowserOptions {
    browserContext: BrowserContext;
    version: string;
}

/**
 * Browser wrapper created to have consistent API with persistent and non-persistent contexts.
 */
export class PlaywrightBrowser extends EventEmitter implements Browser {
    private _browserContext: BrowserContext;
    private _version: string;
    private _isConnected = true;
    private _browserType?: BrowserType;

    constructor(options: BrowserOptions) {
        super();

        const { browserContext, version } = options;
        this._browserContext = browserContext;

        this._version = version;

        this._browserContext.once('close', () => {
            this._isConnected = false;
            this.emit('disconnected');
        });
    }

    async close(): Promise<void> {
        await this._browserContext.close();
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
