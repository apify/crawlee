import { BROWSER_CONTROLLER_EVENTS, BrowserController } from '@crawlee/browser-pool';
import { describe, expect, test, vi } from 'vitest';

class TestBrowserController extends BrowserController {
    normalizeProxyOptions(): Record<string, unknown> {
        return {};
    }

    protected async _close(): Promise<void> {}

    protected async _kill(): Promise<void> {}

    protected async _newPage(): Promise<any> {
        throw new Error('Not used in this test.');
    }

    protected async _setCookies(): Promise<void> {}

    protected async _getCookies(): Promise<any[]> {
        return [];
    }
}

describe('BrowserController close fallback', () => {
    test('fallback kill timer is detached from event loop', async () => {
        const controller = new TestBrowserController();

        controller.assignBrowser();

        const unref = vi.fn();
        const fakeTimerHandle = { unref };

        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((handler: any) => {
            void handler;
            return fakeTimerHandle as any;
        });

        const browserClosedHandler = vi.fn();
        controller.on(BROWSER_CONTROLLER_EVENTS.BROWSER_CLOSED, browserClosedHandler);

        await controller.close();

        expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
        expect(browserClosedHandler).toHaveBeenCalledTimes(1);
        expect(unref).toHaveBeenCalledTimes(1);

        setTimeoutSpy.mockRestore();
    });
});
