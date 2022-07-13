import type {
    BrowserContextOptions,
    Browser as PuppeteerBrowser,
    Page,
    LaunchOptions,
    BrowserLaunchArgumentOptions,
    BrowserConnectOptions,
    Product,
} from 'puppeteer';

export * from 'puppeteer';

export interface ContextOptions extends BrowserContextOptions {
    proxyUsername?: string;
    proxyPassword?: string;
}

export declare class Browser extends PuppeteerBrowser {
    newPage: (contextOptions?: ContextOptions) => Promise<Page>;
}

export declare function launch(options?: LaunchOptions & BrowserLaunchArgumentOptions & BrowserConnectOptions & {
    product?: Product;
    extraPrefsFirefox?: Record<string, unknown>;
}): Promise<Browser>;
