/// <reference types="node" />
import { EventEmitter } from 'node:events';
// @ts-ignore optional peer dependency
import type { BrowserContext, BrowserType, Browser } from 'playwright';
export interface BrowserOptions {
    browserContext: BrowserContext;
    version: string;
}
/**
 * Browser wrapper created to have consistent API with persistent and non-persistent contexts.
 */
export declare class PlaywrightBrowser extends EventEmitter implements Browser {
    private _browserContext;
    private _version;
    private _isConnected;
    private _browserType?;
    constructor(options: BrowserOptions);
    close(): Promise<void>;
    contexts(): BrowserContext[];
    isConnected(): boolean;
    version(): string;
    /** @internal */
    _setBrowserType(browserType: BrowserType): void;
    browserType(): BrowserType;
    newPage(...args: Parameters<BrowserContext['newPage']>): ReturnType<BrowserContext['newPage']>;
    newContext(): Promise<never>;
    newBrowserCDPSession(): Promise<never>;
    startTracing(): Promise<never>;
    stopTracing(): Promise<never>;
}
//# sourceMappingURL=playwright-browser.d.ts.map