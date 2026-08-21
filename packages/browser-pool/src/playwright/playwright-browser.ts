import { EventEmitter } from 'node:events';

import type { BrowserContext, BrowserType } from 'playwright';

export interface BrowserOptions {
    browserContext: BrowserContext;
    version: string;
}

/**
 * Browser wrapper created to have consistent API with persistent and non-persistent contexts.
 */
export class PlaywrightBrowser extends EventEmitter {
    #browserContext: BrowserContext;
    #version: string;
    #isConnected = true;
    #browserType?: BrowserType;

    constructor(options: BrowserOptions) {
        super();

        const { browserContext, version } = options;
        this.#browserContext = browserContext;
        this.#version = version;

        this.#browserContext.once('close', () => {
            this.#isConnected = false;
            this.emit('disconnected');
        });
    }

    async [Symbol.asyncDispose](): Promise<void> {
        await this.close();
    }

    async close(): Promise<void> {
        await this.#browserContext.close();
    }

    contexts(): BrowserContext[] {
        return [this.#browserContext];
    }

    isConnected(): boolean {
        return this.#isConnected;
    }

    version(): string {
        return this.#version;
    }

    /** @internal */
    setBrowserType(browserType: BrowserType): void {
        this.#browserType = browserType;
    }

    browserType(): BrowserType {
        return this.#browserType!;
    }

    async newPage(...args: Parameters<BrowserContext['newPage']>): ReturnType<BrowserContext['newPage']> {
        return this.#browserContext.newPage(...args);
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
