// @ts-ignore optional peer dependency
import type { Browser, BrowserType, Page } from 'playwright';
import type { Cookie } from '@crawlee/types';
import { BrowserController } from '../abstract-classes/browser-controller';
import type { SafeParameters } from '../utils';
export declare class PlaywrightController extends BrowserController<BrowserType, SafeParameters<BrowserType['launch']>[0], Browser> {
    normalizeProxyOptions(proxyUrl: string | undefined, pageOptions: any): Record<string, unknown>;
    protected _newPage(contextOptions?: SafeParameters<Browser['newPage']>[0]): Promise<Page>;
    protected _close(): Promise<void>;
    protected _kill(): Promise<void>;
    protected _getCookies(page: Page): Promise<Cookie[]>;
    protected _setCookies(page: Page, cookies: Cookie[]): Promise<void>;
}
//# sourceMappingURL=playwright-controller.d.ts.map