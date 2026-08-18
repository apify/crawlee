import { EventEmitter } from 'node:events';
/**
 * Browser wrapper created to have consistent API with persistent and non-persistent contexts.
 */
export class PlaywrightBrowser extends EventEmitter {
    #browserContext;
    #version;
    #isConnected = true;
    #browserType;
    constructor(options) {
        super();
        const { browserContext, version } = options;
        this.#browserContext = browserContext;
        this.#version = version;
        this.#browserContext.once('close', () => {
            this.#isConnected = false;
            this.emit('disconnected');
        });
    }
    async [Symbol.asyncDispose]() {
        await this.close();
    }
    async close() {
        await this.#browserContext.close();
    }
    contexts() {
        return [this.#browserContext];
    }
    isConnected() {
        return this.#isConnected;
    }
    version() {
        return this.#version;
    }
    /** @internal */
    setBrowserType(browserType) {
        this.#browserType = browserType;
    }
    browserType() {
        return this.#browserType;
    }
    async newPage(...args) {
        return this.#browserContext.newPage(...args);
    }
    async newContext() {
        throw new Error('Function `newContext()` is not available in incognito mode');
    }
    async newBrowserCDPSession() {
        throw new Error('Function `newBrowserCDPSession()` is not available in incognito mode');
    }
    async startTracing() {
        throw new Error('Function `startTracing()` is not available in incognito mode');
    }
    async stopTracing() {
        throw new Error('Function `stopTracing()` is not available in incognito mode');
    }
}
