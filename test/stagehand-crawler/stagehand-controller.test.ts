import log from '@apify/log';

import { StagehandController } from '../../packages/stagehand-crawler/src/internals/stagehand-controller';
import type { StagehandPlugin } from '../../packages/stagehand-crawler/src/internals/stagehand-plugin';

describe('StagehandController', () => {
    let mockPlugin: StagehandPlugin;
    let mockStagehand: any;
    let mockBrowser: any;
    let stagehandInstances: WeakMap<any, any>;

    beforeEach(() => {
        // Create mock browser
        mockBrowser = {
            newContext: vi.fn().mockResolvedValue({
                newPage: vi.fn().mockResolvedValue({
                    goto: vi.fn(),
                    close: vi.fn(),
                    context: vi.fn().mockReturnValue({
                        cookies: vi.fn().mockResolvedValue([]),
                        addCookies: vi.fn().mockResolvedValue(undefined),
                    }),
                }),
                close: vi.fn(),
            }),
            close: vi.fn(),
            contexts: vi.fn().mockReturnValue([]),
            isConnected: vi.fn().mockReturnValue(true),
        };

        // Create mock Stagehand
        mockStagehand = {
            close: vi.fn().mockResolvedValue(undefined),
            context: {
                newPage: vi.fn().mockResolvedValue({
                    goto: vi.fn(),
                    close: vi.fn(),
                    context: vi.fn().mockReturnValue({
                        cookies: vi.fn().mockResolvedValue([]),
                        addCookies: vi.fn().mockResolvedValue(undefined),
                    }),
                }),
            },
        };

        // Create WeakMap to store Stagehand instances
        stagehandInstances = new WeakMap();
        stagehandInstances.set(mockBrowser, mockStagehand);

        // Create mock plugin
        mockPlugin = {
            name: 'StagehandPlugin',
        } as any;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    test('should create controller', () => {
        const controller = new StagehandController(mockPlugin, stagehandInstances);

        expect(controller).toBeDefined();
    });

    test('should get Stagehand instance', () => {
        const controller = new StagehandController(mockPlugin, stagehandInstances);
        (controller as any).browser = mockBrowser;

        const stagehand = controller.getStagehand();

        expect(stagehand).toBe(mockStagehand);
    });

    test('should throw error if Stagehand instance not found', () => {
        const controller = new StagehandController(mockPlugin, new WeakMap());
        (controller as any).browser = mockBrowser;

        expect(() => controller.getStagehand()).toThrow('Stagehand instance not found for browser');
    });

    test('should set cookies (stubbed - Stagehand v3 limitation)', async () => {
        const controller = new StagehandController(mockPlugin, stagehandInstances);

        const mockPage: any = {};

        const cookies = [
            {
                name: 'test_cookie',
                value: 'test_value',
                domain: 'example.com',
                path: '/',
                expires: 1234567890,
                httpOnly: true,
                secure: true,
                sameSite: 'Lax' as const,
            },
        ];

        // Should complete without error even though it doesn't actually set cookies
        // This is a known limitation - Stagehand v3 doesn't have cookie management APIs
        await expect((controller as any)._setCookies(mockPage, cookies)).resolves.toBeUndefined();
    });

    test('should get cookies (stubbed - Stagehand v3 limitation)', async () => {
        const controller = new StagehandController(mockPlugin, stagehandInstances);

        const mockPage: any = {};

        // Should return empty array since Stagehand v3 doesn't have cookie management APIs
        // This is a known limitation tracked in GitHub issue #1250
        const cookies = await (controller as any)._getCookies(mockPage);

        expect(cookies).toEqual([]);
    });

    test('should handle cookies without expiration (stubbed - Stagehand v3 limitation)', async () => {
        const controller = new StagehandController(mockPlugin, stagehandInstances);

        const mockPage: any = {};

        // Should return empty array since Stagehand v3 doesn't have cookie management APIs
        const cookies = await (controller as any)._getCookies(mockPage);

        expect(cookies).toEqual([]);
    });

    test('should close Stagehand on controller close', async () => {
        const controller = new StagehandController(mockPlugin, stagehandInstances);
        (controller as any).browser = mockBrowser;

        await (controller as any)._close();

        expect(mockStagehand.close).toHaveBeenCalled();
    });

    test('should handle close errors gracefully', async () => {
        mockStagehand.close = vi.fn().mockRejectedValue(new Error('Close failed'));

        const controller = new StagehandController(mockPlugin, stagehandInstances);
        (controller as any).browser = mockBrowser;

        // Mock log.error to prevent output and verify it's called
        const logErrorSpy = vi.spyOn(log, 'error').mockImplementation(() => {});

        // Should not throw
        await expect((controller as any)._close()).resolves.toBeUndefined();

        // Verify error was logged
        expect(logErrorSpy).toHaveBeenCalledWith('Error closing Stagehand', { error: expect.any(Error) });

        logErrorSpy.mockRestore();
    });

    test('should kill Stagehand on controller kill', async () => {
        const controller = new StagehandController(mockPlugin, stagehandInstances);
        (controller as any).browser = mockBrowser;

        await (controller as any)._kill();

        expect(mockStagehand.close).toHaveBeenCalledWith({ force: true });
    });

    test('should handle kill errors gracefully', async () => {
        mockStagehand.close = vi.fn().mockRejectedValue(new Error('Kill failed'));

        const controller = new StagehandController(mockPlugin, stagehandInstances);
        (controller as any).browser = mockBrowser;

        // Should not throw
        await expect((controller as any)._kill()).resolves.toBeUndefined();
    });

    describe('_newPage', () => {
        let mockCdpSession: any;
        let mockPage: any;

        beforeEach(() => {
            mockCdpSession = {
                send: vi.fn().mockResolvedValue({ frameTree: { frame: { id: 'MAIN_FRAME_1' } } }),
                detach: vi.fn().mockResolvedValue(undefined),
            };

            mockPage = {
                once: vi.fn(),
                close: vi.fn().mockResolvedValue(undefined),
                context: vi.fn().mockReturnValue({
                    newCDPSession: vi.fn().mockResolvedValue(mockCdpSession),
                }),
            };

            mockBrowser.contexts = vi.fn().mockReturnValue([{ newPage: vi.fn().mockResolvedValue(mockPage) }]);
            mockStagehand.context.resolvePageByMainFrameId = vi.fn().mockReturnValue(undefined);
        });

        const createController = () => {
            const controller = new StagehandController(mockPlugin, stagehandInstances);
            (controller as any).browser = mockBrowser;

            return controller;
        };

        test('should not return the page before Stagehand registers it', async () => {
            // Stagehand registers pages from a CDP event, so the page is unresolvable for a short while.
            let attempts = 0;
            mockStagehand.context.resolvePageByMainFrameId = vi.fn(() =>
                ++attempts < 3 ? undefined : { v3Page: true },
            );

            const page = await (createController() as any)._newPage();

            expect(page).toBe(mockPage);
            expect(attempts).toBe(3);
            expect(mockStagehand.context.resolvePageByMainFrameId).toHaveBeenCalledWith('MAIN_FRAME_1');
            expect(mockPage.close).not.toHaveBeenCalled();
        });

        test('should detach the CDP session used to read the main frame id', async () => {
            mockStagehand.context.resolvePageByMainFrameId = vi.fn().mockReturnValue({ v3Page: true });

            await (createController() as any)._newPage();

            expect(mockCdpSession.send).toHaveBeenCalledWith('Page.getFrameTree');
            expect(mockCdpSession.detach).toHaveBeenCalled();
        });

        test('should throw when Stagehand never registers the page', async () => {
            const controller = createController();

            await expect((controller as any).waitForStagehandToRegisterPage(mockPage, 100)).rejects.toThrow(
                'Stagehand did not register the page within 100ms',
            );
        });

        test('should close the page when Stagehand never registers it', async () => {
            const controller = createController();
            vi.spyOn(controller as any, 'waitForStagehandToRegisterPage').mockRejectedValue(
                new Error('not registered'),
            );

            await expect((controller as any)._newPage()).rejects.toThrow('Failed to create new page: not registered');
            expect(mockPage.close).toHaveBeenCalled();
        });
    });

    // Note: Proxy authentication is now handled at the plugin level using anonymizeProxySugar
    // from proxy-chain, which creates a local proxy that handles auth transparently.
    // See stagehand-plugin.ts for the implementation.
});
