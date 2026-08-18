import { EventEmitter } from 'node:events';
import type { BrowserContext, BrowserType } from 'playwright';
export interface BrowserOptions {
    browserContext: BrowserContext;
    version: string;
}
/**
 * Browser wrapper created to have consistent API with persistent and non-persistent contexts.
 */
export declare class PlaywrightBrowser extends EventEmitter {
    #private;
    constructor(options: BrowserOptions);
    [Symbol.asyncDispose](): Promise<void>;
    close(): Promise<void>;
    contexts(): BrowserContext[];
    isConnected(): boolean;
    version(): string;
    /** @internal */
    setBrowserType(browserType: BrowserType): void;
    browserType(): BrowserType;
    newPage(...args: Parameters<BrowserContext['newPage']>): ReturnType<BrowserContext['newPage']>;
    newContext(): Promise<never>;
    newBrowserCDPSession(): Promise<never>;
    startTracing(): Promise<never>;
    stopTracing(): Promise<never>;
}
